#!/usr/bin/env python3
"""Montador local do Contínuo. Python 3.9+ e FFmpeg/ffprobe no PATH.
Execute na pasta extraída: python render_mp4.py
Não usa rede, chaves, serviços externos ou pacotes Python adicionais.
"""
from pathlib import Path
import json, subprocess, sys, tempfile, shutil, argparse

def run(args):
    completed = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if completed.returncode:
        raise RuntimeError(completed.stderr[-4000:])
    return completed.stdout

def probe(path):
    return json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)]))

def audio_path(root, stem):
    candidates = list((root / 'audio').glob(stem + '.*'))
    if len(candidates) > 1:
        raise ValueError('Mais de um arquivo de áudio para ' + stem)
    return candidates[0] if candidates else None

def main():
    parser = argparse.ArgumentParser(description='Contínuo — montagem de cenas aprovadas em MP4')
    parser.add_argument('--folder', default=str(Path(__file__).resolve().parent))
    parser.add_argument('--output', default='filme-completo.mp4')
    args = parser.parse_args()
    root = Path(args.folder).resolve()
    output = Path(args.output)
    if not output.is_absolute(): output = root / output
    if output.exists(): raise ValueError('O arquivo de saída já existe. Escolha outro nome com --output.')
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        raise ValueError('Instale FFmpeg (incluindo ffprobe) e coloque no PATH antes de continuar.')
    project = json.loads((root / 'projeto.json').read_text(encoding='utf-8'))['project']
    scenes = project['scenes']
    if not scenes or any(s.get('status') != 'approved' or not s.get('lastFrame') for s in scenes):
        raise ValueError('Todas as cenas precisam estar aprovadas e ter último frame antes da montagem.')
    width, height = (1280, 720) if project['aspect'] == '16:9' else (720, 1280)
    total = 0.0
    print('CONTÍNUO | Montando', len(scenes), 'cenas aprovadas.')
    with tempfile.TemporaryDirectory(prefix='continuo-') as temp:
        work = Path(temp)
        normalized = []
        for i, scene in enumerate(scenes):
            files = list((root / 'clips').glob(f'scene-{i:04d}.*'))
            if len(files) != 1: raise ValueError(f'Clipe ausente ou ambíguo na cena {i+1}.')
            clip = files[0]
            info = probe(clip)
            video = next((s for s in info['streams'] if s['codec_type'] == 'video'), None)
            if video is None: raise ValueError(f'A cena {i+1} não tem vídeo.')
            duration = float(info['format']['duration'])
            if float(scene['duration']) != 10 or abs(duration - 10) > 0.12:
                raise ValueError(f'Duração divergente na cena {i+1}; revise no estúdio.')
            if (video['width'], video['height']) != (width, height):
                raise ValueError(f'Formato divergente na cena {i+1}; revise no estúdio.')
            replacement = audio_path(root, f'scene-{i:04d}')
            has_audio = any(s['codec_type'] == 'audio' for s in info['streams'])
            target = work / f'{i:04d}.mp4'
            cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', str(clip)]
            if replacement:
                cmd += ['-i', str(replacement)]
                audio_stream = '1:a:0'
            elif project.get('muteOriginal') or not has_audio:
                cmd += ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']
                audio_stream = '1:a:0'
            else: audio_stream = '0:a:0'
            cmd += ['-map', '0:v:0', '-map', audio_stream,
                    '-vf', f'scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,fps=24,setsar=1,tpad=stop_mode=clone:stop_duration=0.12',
                    '-af', 'apad,aresample=48000', '-t', '10',
                    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
                    '-video_track_timescale', '24000', '-movflags', '+faststart', str(target)]
            print(f'  Cena {i+1}/{len(scenes)}: {scene["title"]}')
            run(cmd)
            # The actual normalized duration determines master track timing.
            total += 10.0
            normalized.append(target)
        listing = work / 'concat.txt'
        listing.write_text('\n'.join(f"file '{p.name}'" for p in normalized), encoding='utf-8')
        joined = work / 'joined.mp4'
        run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-f', 'concat', '-safe', '0', '-i', str(listing), '-c', 'copy', str(joined)])
        music = audio_path(root, 'music')
        narration = audio_path(root, 'narration')
        if music or narration:
            cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', str(joined)]
            filters = ['[0:a]aresample=48000[a0]']
            inputs = ['[a0]']
            index = 1
            if music:
                cmd += ['-stream_loop', '-1', '-i', str(music)]
                volume = max(0, min(1, float(project.get('musicVolume', .16))))
                filters.append(f'[{index}:a]aresample=48000,volume={volume},atrim=duration={total}[music]')
                inputs.append('[music]'); index += 1
            if narration:
                cmd += ['-i', str(narration)]
                filters.append(f'[{index}:a]aresample=48000,apad,atrim=duration={total}[narration]')
                inputs.append('[narration]')
            filters.append(''.join(inputs) + f'amix=inputs={len(inputs)}:normalize=0:duration=first,alimiter=limit=0.95:level=false[mix]')
            cmd += ['-filter_complex', ';'.join(filters), '-map', '0:v:0', '-map', '[mix]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', f'{total:.6f}', '-movflags', '+faststart', str(output)]
            run(cmd)
        else:
            # Copy the normalized concatenation; target is deliberately not overwritten.
            shutil.copyfile(joined, output)
        final = probe(output)
        print(f'Pronto: {output}')
        print(f'Duração: {float(final["format"]["duration"]):.2f}s | {width}x{height} | H.264/AAC')
        print('Assista à montagem completa para conferir cortes, falas e mixagem.')

if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, OSError, KeyError) as exc:
        print('Não foi possível montar o vídeo:', exc, file=sys.stderr)
        sys.exit(1)
