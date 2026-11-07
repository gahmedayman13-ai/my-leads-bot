const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.GROUP_ID;

async function sendMessage(text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHANNEL_ID, text: text, parse_mode: 'Markdown' })
  });
}

async function run() {
  console.log('Fetching tasks...');
  try {
    // جلب التاسكات
    const res = await fetch('https://www.freelancer.com/api/projects/0.1/projects/active/?limit=5');
    const data = await res.json();
    if (data && data.result) {
      const tasks = data.result.projects.slice(0, 3);
      for (const t of tasks) {
        await sendMessage(`🔥 *Task:* ${t.title}\n💰 *Budget:* Check Link\n🔗 [Apply Here](https://www.freelancer.com/projects/${t.seo_url})`);
      }
    }

    // جلب الوظايف
    const jobRes = await fetch('https://remoteok.com/api');
    const jobData = await jobRes.json();
    if (jobData && jobData.length > 1) {
      const j = jobData[1]; // أول وظيفة
      await sendMessage(`🚀 *Job:* ${j.position || j.role}\n🏢 *Company:* ${j.company}\n🔗 [Apply Here](${j.url})`);
    }
    console.log('Done!');
  } catch (e) {
    console.error('Error:', e.message);
  }
}

run();
