FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production

# Ekstraksi teks lampiran:
#   tesseract-ocr + data ind/eng  -> membaca tulisan di gambar & PDF pindai
#   poppler-utils                 -> merender halaman PDF jadi gambar untuk OCR
#   font-liberation + fontconfig  -> WAJIB. Tanpa font, poppler merender
#     halaman KOSONG tanpa error dan OCR mengembalikan teks nihil.
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-ind tesseract-ocr-data-eng \
    poppler-utils font-liberation fontconfig
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
COPY sql ./sql
COPY admin ./admin
EXPOSE 8080
USER node
CMD ["node", "src/index.js"]
