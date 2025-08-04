const express = require('express');
const axios = require('axios');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
app.use(express.json());

app.post('/concat', async (req, res) => {
  const { urls } = req.body;
  if (!Array.isArray(urls) || urls.length < 2) {
    return res.status(400).json({ error: 'Send at least 2 video URLs' });
  }

  const sessionId = uuidv4();
  const tmpDir = path.join(__dirname, 'tmp', sessionId);
  fs.mkdirSync(tmpDir, { recursive: true });

  const videoPaths = [];

  for (let i = 0; i < urls.length; i++) {
    const videoPath = path.join(tmpDir, `video${i}.mp4`);
    const response = await axios({ url: urls[i], responseType: 'stream' });
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(videoPath);
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    videoPaths.push(videoPath);
  }

  const listFile = path.join(tmpDir, 'list.txt');
  const fileList = videoPaths.map(p => `file '${p}'`).join('\n');
  fs.writeFileSync(listFile, fileList);

  const outputPath = path.join(tmpDir, 'output.mp4');

  ffmpeg()
    .input(listFile)
    .inputOptions('-f', 'concat', '-safe', '0')
    .outputOptions('-c', 'copy')
    .on('end', () => {
      res.sendFile(outputPath, {}, () => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      });
    })
    .on('error', (err) => {
      console.error(err);
      res.status(500).json({ error: 'FFmpeg failed', details: err.message });
    })
    .output(outputPath)
    .run();
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`FFmpeg API listening on port ${port}`);
});
