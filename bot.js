const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.GROUP_ID;
const Parser = require('rss-parser');
const parser = new Parser();

// ==========================================
// 1. الإعدادات
// ==========================================
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // فلتر الساعتين للتاسكات
const DELAY_TASKS_MS = 4 * 60 * 1000; // 4 دقايق بين كل تاسك
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000; // 8 ساعات بين كل وظيفة

// ==========================================
// 2. دوال مساعدة
// ==========================================
function cleanDescription(html, title, company, maxLength = 200) {
  if (!html) return 'No description provided.';
  let text = html.replace(/<[^>]*>?/gm, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  if (title) text = text.replace(new RegExp(title, 'gi'), '');
  if (company) text = text.replace(new RegExp(company, 'gi'), '');
  text = text.replace(/is hiring a|is looking for a|Position Type:|Work Arrangement:/gi, '').trim();
  return text.substring(0, maxLength) + (text.length > maxLength ? '...' : '');
}

function isRecent(dateString) {
  if (!dateString) return false;
  try {
    const itemDate = new Date(dateString);
    const now = new Date();
    return (now.getTime() - itemDate.getTime()) <= MAX_AGE_MS;
  } catch (e) { return false; }
}

async function sendMessage(text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHANNEL_ID, text: text, parse_mode: 'HTML', disable_web_page_preview: true })
  });
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ==========================================
// 3. المصادر
// ==========================================
async function fetchFreelancer() {
  try {
    const res = await fetch('https://www.freelancer.com/api/projects/0.1/projects/active/?limit=20&job_details=true');
    const data = await res.json();
    if (!data || !data.result) return [];
    return data.result.projects.map(p => ({
      title: p.title, budget: p.budget?.minimum ? `$${p.budget.minimum}` : 'Negotiable',
      url: `https://www.freelancer.com/projects/${p.seo_url}`,
      date: p.time_submitted ? new Date(p.time_submitted * 1000).toISOString() : null,
    }));
  } catch (e) { return []; }
}

async function fetchRedditTasks() {
  try {
    const feed = await parser.parseURL('https://old.reddit.com/r/forhire/new/.rss');
    return feed.items.map(item => ({
      title: item.title || 'Untitled Task', budget: 'Check Post', url: item.link,
      date: item.pubDate ? new Date(item.pubDate).toISOString() : null,
    }));
  } catch (e) { return []; }
}

async function fetchGuruTasks() {
  try {
    const feed = await parser.parseURL('https://www.guru.com/rss/jobs/');
    return feed.items.map(item => ({
      title: item.title || 'Untitled Task', budget: 'Negotiable', url: item.link,
      date: item.pubDate ? new Date(item.pubDate).toISOString() : null,
    }));
  } catch (e) { return []; }
}

async function fetchRemoteOK() {
  try {
    const res = await fetch('https://remoteok.com/api');
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.slice(1).map(j => {
      let salary = 'Not specified';
      if (j.salary_min && j.salary_min > 0) salary = `$${j.salary_min} - $${j.salary_max}`;
      return {
        title: j.position || j.role, company: j.company, location: j.location || 'Remote',
        url: j.url, date: j.date ? new Date(j.date * 1000).toISOString() : null,
        description: j.description, salary: salary
      };
    });
  } catch (e) { return []; }
}

async function fetchJobicy() {
  try {
    const res = await fetch('https://jobicy.com/api/v2/remote-jobs?count=20');
    const data = await res.json();
    if (!data || !data.jobs) return [];
    return data.jobs.map(j => {
      let salary = 'Not specified';
      if (j.annualSalaryMin && j.annualSalaryMin > 0) salary = `$${j.annualSalaryMin}`;
      return {
        title: j.jobTitle, company: j.companyName, location: j.jobGeo || 'Remote',
        url: j.url, date: j.pubDate ? new Date(j.pubDate).toISOString() : null,
        description: j.jobDescription, salary: salary
      };
    });
  } catch (e) { return []; }
}

// ==========================================
// 4. الدالة الرئيسية
// ==========================================
async function run() {
  console.log('🚀 بدء التنفيذ...');

  // سحب البيانات
  const [fTasks, rTasks, gTasks, rJobs, jJobs] = await Promise.all([
    fetchFreelancer(), fetchRedditTasks(), fetchGuruTasks(), fetchRemoteOK(), fetchJobicy()
  ]);

  let allTasks = [...fTasks, ...rTasks, ...gTasks].filter(t => isRecent(t.date));
  let allJobs = [...rJobs, ...jJobs].filter(j => isRecent(j.date));
  allJobs.sort((a, b) => new Date(b.date) - new Date(a.date));

  // ---------------------------------------------------
  // 1. نشر 3 تاسكات (بفاصل 4 دقايق)
  // ---------------------------------------------------
  console.log(`🎯 تاسكات متاحة: ${allTasks.length}`);
  const tasksToSend = allTasks.slice(0, 3);

  for (let i = 0; i < tasksToSend.length; i++) {
    const t = tasksToSend[i];
    const msg = `🔥 <b>New Task</b>\n━━━━━━━━━━━━━━━\n💼 <b>Title:</b> ${t.title}\n💰 <b>Budget:</b> ${t.budget}\n\n👉 <a href="${t.url}">Apply Here</a>`;
    await sendMessage(msg);
    console.log(`✅ تاسك رقم ${i+1} تم نشره.`);
    
    if (i < tasksToSend.length - 1) {
      await wait(DELAY_TASKS_MS); // 4 دقايق
    }
  }

  // ---------------------------------------------------
  // 2. نشر وظيفة واحدة فقط إذا مر 8 ساعات
  // ---------------------------------------------------
  let lastJobTime = 0;
  let currentSha = null;

  // قراءة وقت آخر وظيفة من GitHub
  try {
    const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/contents/job_count.json`);
    if (res.ok) {
      const data = await res.json();
      currentSha = data.sha;
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      const countData = JSON.parse(content);
      if (countData.last_posted_at) {
        lastJobTime = countData.last_posted_at;
      }
    }
  } catch (e) { console.log('ملف التوقيت مش موجود، هيتعمل جديد.'); }

  const timeSinceLastJob = Date.now() - lastJobTime;
  console.log(`⏳ الوقت اللي فات من آخر وظيفة: ${(timeSinceLastJob / (1000 * 60 * 60)).toFixed(1)} ساعة.`);

  if (timeSinceLastJob >= EIGHT_HOURS_MS && allJobs.length > 0) {
    // ننشر وظيفة واحدة بس
    const j = allJobs[0];
    const cleanDesc = cleanDescription(j.description, j.title, j.company);
    const msg = `🚀 <b>Premium Remote Job</b>\n━━━━━━━━━━━━━━━\n💼 <b>Role:</b> ${j.title}\n🏢 <b>Company:</b> ${j.company}\n📍 <b>Location:</b> ${j.location}\n💰 <b>Salary:</b> ${j.salary}\n\n📝 <b>Details:</b>\n${cleanDesc}\n\n👉 <a href="${j.url}">Apply Here</a>`;
    
    await sendMessage(msg);
    console.log(`✅ تم نشر الوظيفة بنجاح.`);

    // تحديث وقت آخر وظيفة في GitHub
    const newContent = Buffer.from(JSON.stringify({ last_posted_at: Date.now() })).toString('base64');
    const body = { message: `Update last job time`, content: newContent };
    if (currentSha) body.sha = currentSha;

    try {
      await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/contents/job_count.json`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      console.log('💾 تم حفظ وقت الوظيفة.');
    } catch (e) { console.log('❌ فشل حفظ الوقت.'); }

  } else {
    console.log('⏭️ لسه مكملناش 8 ساعات على آخر وظيفة، مش هننزل وظيفة دلوقتي.');
  }

  console.log('🎉 انتهى التنفيذ.');
}

run();
