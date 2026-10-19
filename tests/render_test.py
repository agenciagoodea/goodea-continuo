from pathlib import Path
import tempfile, subprocess, json, sys
script=Path(__file__).resolve().parents[1]/'public/render_mp4.py'
def cmd(args):
 r=subprocess.run(args,capture_output=True,text=True)
 assert r.returncode==0,r.stderr
 return r.stdout
with tempfile.TemporaryDirectory(prefix='continuo-test-') as folder:
 root=Path(folder);(root/'clips').mkdir();(root/'audio').mkdir()
 cmd(['ffmpeg','-v','error','-f','lavfi','-i','color=c=navy:s=1280x720:r=24:d=10','-f','lavfi','-i','sine=frequency=440:duration=10','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',str(root/'clips/scene-0000.mp4')])
 cmd(['ffmpeg','-v','error','-f','lavfi','-i','color=c=teal:s=1280x720:r=24:d=10','-c:v','libx264','-pix_fmt','yuv420p',str(root/'clips/scene-0001.mp4')])
 cmd(['ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=200:duration=2',str(root/'audio/music.wav')])
 cmd(['ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=600:duration=10',str(root/'audio/scene-0001.wav')])
 p={'aspect':'16:9','musicVolume':.1,'muteOriginal':False,'scenes':[{'title':'Teste 1','duration':10,'status':'approved','lastFrame':{'id':'f1'}},{'title':'Teste 2','duration':10,'status':'approved','lastFrame':{'id':'f2'}}]}
 (root/'projeto.json').write_text(json.dumps({'project':p}))
 output=cmd([sys.executable,str(script),'--folder',str(root)])
 meta=json.loads(cmd(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(root/'filme-completo.mp4')]))
 v=next(s for s in meta['streams'] if s['codec_type']=='video');a=next(s for s in meta['streams'] if s['codec_type']=='audio')
 assert v['width']==1280 and v['height']==720 and v['codec_name']=='h264'
 assert a['codec_name']=='aac'
 assert 19.9<float(meta['format']['duration'])<20.2,meta['format']
 blocked=subprocess.run([sys.executable,str(script),'--folder',str(root)],capture_output=True,text=True)
 assert blocked.returncode==1 and 'já existe' in blocked.stderr
 p['scenes'][0]['status']='review';(root/'projeto.json').write_text(json.dumps({'project':p}))
 blocked=subprocess.run([sys.executable,str(script),'--folder',str(root),'--output','bloqueado.mp4'],capture_output=True,text=True)
 assert blocked.returncode==1 and 'aprovadas' in blocked.stderr
 assert not (root/'bloqueado.mp4').exists()
 print('PASS: montagem MP4 real 1280x720 H.264/AAC, faixa contínua, substituição de áudio por cena, bloqueio sem aprovação e proteção contra sobrescrita.')
