# verify() from export_pack.py (Pillow), applied to every GIF in a folder + a contact sheet of frame 8
import sys, hashlib
from pathlib import Path
from PIL import Image, ImageSequence
SIZE, TICKS, DELAY = 320, 24, 80
def verify(path):
    frames=set(); duration=0
    with Image.open(path) as image:
        if image.size!=(SIZE,SIZE) or image.info.get('loop')!=0: raise ValueError(f'Invalid size or loop flag: {path}')
        for frame in ImageSequence.Iterator(image):
            duration+=frame.info['duration']
            rendered=frame.convert('RGBA'); alpha=rendered.getchannel('A'); box=alpha.getbbox()
            if alpha.getextrema()!=(0,255) or box is None or not all(0<k<SIZE for k in box): raise ValueError(f'Invalid alpha or clipped content: {path} {box}')
            frames.add(hashlib.sha256(rendered.tobytes()).digest())
    if duration!=TICKS*DELAY or len(frames)<4: raise ValueError(f'Missing or inadequate motion: {path} {duration} {len(frames)}')
    return len(frames)
d=Path(sys.argv[1]); gifs=sorted(d.glob('*.gif')); res=[]
for g in gifs:
    try: res.append((g.name, verify(g)))
    except Exception as e: res.append((g.name, 'FAIL '+str(e)))
for r in res: print(*r)
sheet=Image.new('RGBA',(SIZE*4,SIZE*((len(gifs)+3)//4)),'#8890b0')
for i,g in enumerate(gifs):
    im=Image.open(g); im.seek(8); sheet.alpha_composite(im.convert('RGBA'),(SIZE*(i%4),SIZE*(i//4)))
sheet.convert('RGB').resize((sheet.width//2,sheet.height//2)).save(sys.argv[2])
