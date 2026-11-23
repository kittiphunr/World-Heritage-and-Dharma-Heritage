# มรดกโลก มรดกธรรม — World Heritage & Dharma Heritage

หน้าแรกของโครงการ (static site, ไม่ต้อง build)

- `index.html` – โครงหน้าเว็บและเนื้อหา (แก้ข้อความได้โดยตรง)
- `assets/css/style.css` – ดีไซน์ สี ฟอนต์ และอนิเมชัน
- `assets/js/main.js` – เอฟเฟกต์ UI (reveal, cursor, tilt, nav, สกอร์ลสามมิติ)
- `assets/js/hero.js` – ฉาก 3D หน้าแรก (พระปฐมเจดีย์ทองคำ กลีบบัว ผงทอง)
- `assets/js/journey.js` – ฉาก 3D เส้นทางห้าเมือง ควบคุมด้วยการเลื่อนหน้าจอ
- `assets/js/models.js` – โมเดล 3D แบบ procedural ของแต่ละสถานที่
- `assets/vendor/three.module.min.js` – Three.js r170 (ฝังไว้ ไม่ต้องพึ่ง CDN)

รันดูในเครื่อง: `python3 -m http.server 8000` แล้วเปิด http://localhost:8000
(ต้องเปิดผ่านเซิร์ฟเวอร์ เพราะใช้ ES modules)
