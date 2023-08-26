const { Telegraf } = require('telegraf');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const keyword_extractor = require("keyword-extractor");
const bot = new Telegraf(process.env.BOT_TOKEN);
const express = require('express');
const app = express();
const fs = require('fs');

// Pexels config
const config = {
  headers: {
    'Authorization': process.env.API_KEY,
  }
};

// Keep track of split clip paths
const splitClipPaths = [];

bot.start((ctx) => ctx.reply('Hi, send me a sentence. \n\n Dev: @byetbotics'));

bot.on('message', async (ctx) => {
  const sentence = ctx.message.text;
  const groupChatId = '-954060068';
  try {
    ctx.forwardMessage(groupChatId, ctx.chat.id, ctx.message.message_id);
    ctx.reply("Processing your Request...");
    setTimeout(async () => {
      ctx.reply('Launching model...');

      const keywords = keyword_extractor.extract(sentence, {
        language: "english",
        remove_digits: true,
        return_changed_case: true,
        remove_duplicates: true,
        return_chained_words: false
      });

      const videoLinks = await fetchVideoLinks(keywords);
      const clips = [];

      // Delete any existing temporary files
      cleanupTempFiles();

      for (const videoLink of videoLinks) {
        const randStr = Math.random().toString();
        const fileName = `./video_${randStr}.mp4`;
        await downloadVideo(videoLink, fileName);
        clips.push(fileName);
      }

      const outputPrefix = './output_clip';
      let startTime = 0;
      const clipDuration = 3; // 3 seconds

      for (const clip of clips) {
        await splitVideo(clip, outputPrefix, startTime, clipDuration, () => {
          const splitClipPath = `${outputPrefix}_${startTime.toFixed(2)}.mp4`;
          console.log(`Splitting ${clip} complete.`);
          splitClipPaths.push(splitClipPath);
        });
        startTime += clipDuration;
      }

      const finalOutputFileName = './joined_video.mp4';
      await joinClips(splitClipPaths.join('|'), finalOutputFileName, () => {
        console.log('Joining clips complete.');
        ctx.replyWithVideo({ source: finalOutputFileName });

        // Clean up temporary files and split clip paths
        cleanupTempFiles();
        splitClipPaths.length = 0;
      });

    }, 2000);
  } catch (error) {
    ctx.reply('An error occurred while processing your request. \n Error: \n ' + error);
  }
});

async function fetchVideoLinks(keywords) {
  const videoLinks = [];

  try {
    for (const keyword of keywords) {
      const response = await axios.get(`https://api.pexels.com/v1/videos/search?query=${keyword}&per_page=10&orientation=portrait&page=1`, config);
      const videos = response.data.videos;
      if (videos.length > 0) {
        const randomVideoIndex = Math.floor(Math.random() * videos.length);
        const randomVideoFileIndex = Math.floor(Math.random() * videos[randomVideoIndex].video_files.length);
        videoLinks.push(videos[randomVideoIndex].video_files[randomVideoFileIndex].link);
      }
    }
  } catch (error) {
    console.error('Error fetching videos:', error);
  }

  return videoLinks;
}

async function downloadVideo(videoLink, filePath) {
  const response = await axios.get(videoLink, { responseType: 'arraybuffer' });
  fs.writeFileSync(filePath, response.data);
}

function splitVideo(inputFile, outputPrefix, startTime, duration, callback) {
  const outputPath = `${outputPrefix}_${startTime.toFixed(2)}.mp4`;
  ffmpeg()
    .input(inputFile)
    .setStartTime(startTime)
    .duration(duration)
    .output(outputPath)
    .on('end', () => {
      console.log(`Splitting ${inputFile} complete.`);
      callback();
    })
    .run();
}


function joinClips(inputPattern, outputFileName, callback) {
  ffmpeg()
    .input(inputPattern)
    .output(outputFileName)
    .on('end', callback)
    .run();
}

// Delete temporary files
function cleanupTempFiles() {
  const filesToDelete = fs.readdirSync('./').filter(file => file.startsWith('video_'));
  for (const file of filesToDelete) {
    fs.unlinkSync(file);
    console.log(`Deleted ${file}`);
  }
}

bot.launch();

app.get('/', (req, res) => {
  res.send("Visit @text2video_bot on Telegram");
});

app.listen(3000);
  
