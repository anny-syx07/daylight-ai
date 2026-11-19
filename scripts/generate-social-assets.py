"""Generate public brand art only; no student data or dashboard screenshots.
Run with Pillow + fontTools installed. Nunito is fetched from Google Fonts (OFL).
"""
from pathlib import Path
import sys
from urllib.request import urlopen
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
font_bytes = Path(sys.argv[1]).read_bytes() if len(sys.argv)>1 else urlopen('https://raw.githubusercontent.com/google/fonts/main/ofl/nunito/Nunito%5Bwght%5D.ttf', timeout=30).read()
fonts = {}
for weight in [600, 700, 800]:
    font = instantiateVariableFont(TTFont(BytesIO(font_bytes)), {'wght': weight}, inplace=True)
    data = BytesIO(); font.save(data); fonts[weight] = data.getvalue()
S = 3
def font(size, weight=700): return ImageFont.truetype(BytesIO(fonts[weight]), round(size*S))
def logo(image, x, y, size):
    d = ImageDraw.Draw(image)
    def box(coords): return tuple(round((v*(size/192)+(x if i%2==0 else y))*S) for i,v in enumerate(coords))
    d.rounded_rectangle(box((0,0,192,192)),radius=round(size/4*S),fill='#efedff')
    stroke = max(1,round(8*size/192*S))
    d.pieslice(box((60,81,132,153)),180,360,fill='#f8c88b',outline='#6c61b8',width=stroke)
    for points in [(40,117,152,117),(96,39,96,53),(49,58,59,69),(143,58,133,69),(30,90,44,90),(148,90,162,90),(65,138,127,138),(79,155,113,155)]:
        d.line(box(points),fill='#6c61b8',width=stroke)
        for a,b in [(points[0],points[1]),(points[2],points[3])]:
            cx,cy=box((a,b));r=stroke/2;d.ellipse((cx-r,cy-r,cx+r,cy+r),fill='#6c61b8')

im = Image.new('RGB',(1200*S,630*S),'#faf9f6')
d = ImageDraw.Draw(im)
def rect(box,fill,r=0,outline=None,width=1): d.rounded_rectangle(tuple(round(v*S) for v in box),round(r*S),fill=fill,outline=outline,width=round(width*S))
def text(x,y,value,size=22,color='#353544',weight=700): d.text((x*S,y*S),value,font=font(size,weight),fill=color)
d.ellipse((810*S,-160*S,1440*S,480*S),fill='#f0ecfa')
d.ellipse((950*S,420*S,1350*S,820*S),fill='#f5edda')
logo(im,68,59,68); text(150,65,'daylight.',43,weight=800)
text(70,198,'Việc học rõ hơn.',64,weight=800)
text(70,277,'Lòng nhẹ hơn.',64,color='#8776b9',weight=800)
text(72,384,'Noti maker · Canvas, Outlook & SIS.',23,color='#81788e',weight=600)
text(72,420,'Outlook qua Gmail · lịch SIS UMT.',23,color='#81788e',weight=600)
rect((72,485,390,529),'#eeebf7',22);text(91,495,'Miễn phí · iPhone & Android',19,color='#8170ae')
text(73,575,'daylight-ai-three.vercel.app',18,color='#a299ad',weight=600)

# A clearly labelled illustration rather than a claim of a live user account.
shadow=Image.new('RGBA',im.size);sd=ImageDraw.Draw(shadow);sd.rounded_rectangle(tuple(v*S for v in (826,57,1135,600)),radius=42*S,fill=(90,70,130,26));shadow=shadow.filter(ImageFilter.GaussianBlur(18*S));im=Image.alpha_composite(im.convert('RGBA'),shadow);d=ImageDraw.Draw(im)
rect((806,42,1120,585),'#ffffff',37,outline='#e4dfee',width=2)
rect((921,55,1005,63),'#e6e0ef',4)
logo(im,830,87,34);text(874,87,'daylight.',22,weight=800)
text(832,148,'Tổng quan',27,weight=800)
text(832,188,'Hôm nay, tiến thêm một chút.',13,color='#9a90a7',weight=600)
rect((830,225,1096,354),'#f5f2fa',15)
text(847,238,'7 ngày tới',14,color='#81728f')
for i,h in enumerate([26,42,32,62,43,74,28]):
    x=849+i*33;rect((x,326-h,x+19,326),'#f0d28e' if i==5 else '#c6bade',5)
    text(x+1,332,['T2','T3','T4','T5','T6','T7','CN'][i],9,color='#a196ad')
for y,title,detail in [(379,'Bài tập tiếp theo','Deadline ở ngay trước mắt'),(452,'Buổi học sắp tới','Tra cứu giờ và phòng học')]:
    rect((831,y,1095,y+63),'#ffffff',10,outline='#eeebf3')
    rect((844,y+15,870,y+41),'#eeebf7',10)
    text(879,y+10,title,15,weight=800);text(879,y+33,detail,11,color='#a299af',weight=600)
text(900,548,'Giao diện minh họa',11,color='#b0a8b9',weight=600)
im.convert('RGB').resize((1200,630),Image.Resampling.LANCZOS).save(ROOT/'public/og-image.png',optimize=True)
for name,size in [('apple-touch-icon.png',180),('icon-192.png',192),('icon-512.png',512)]:
    icon=Image.new('RGB',(size*S,size*S),'#efedff');logo(icon,0,0,size)
    icon.resize((size,size),Image.Resampling.LANCZOS).save(ROOT/'public'/name,optimize=True)
print('Generated OG image (1200×630), Apple icon and PWA PNG icons.')
