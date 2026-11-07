const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.GROUP_ID;

// ==========================================
// 1. الإعدادات
// ==========================================
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // فلتر الساعتين
const DELAY_TASKS_MS = 5 * 60 * 1000; // 5 دقايق بين كل تاسك
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
  return text.substring(0, maxLength) + (text.length > maxLength ? '...' : '');
}

function isRecent(dateString) {
  if (!dateString) return false;
  try {
    const itemDate = new Date(dateString);
    return (new Date().getTime() - itemDate.getTime()) <= MAX_AGE_MS;
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

// دالة سحب الـ RSS يدوياً
async function fetchRSS(url) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    const items = [];
    const matches = text.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>/g);
    for (const match of matches) {
      items.push({ title: match[1], url: match[2] });
    }
    return items;
  } catch (e) { return []; }
}

// ==========================================
// 3. المصادر (تاسكات ووظايف ريموتلي)
// ==========================================
async function fetchFreelancer() {
  try {
    const res = await fetch('https://www.freelancer.com/api/projects/0.1/projects/active/?limit=10&job_details=true');
    const data = await res.json();
    if (!data || !data.result) return [];
    return data.result.projects.map(p => {
      let budgetStr = 'Negotiable';
      if (p.budget && p.budget.minimum) {
        budgetStr = `$${p.budget.minimum} - $${p.budget.maximum || p.budget.minimum}`;
      }
      return {
        title: p.title, budget: budgetStr,
        url: `https://www.freelancer.com/projects/${p.seo_url}`,
        date: p.time_submitted ? new Date(p.time_submitted * 1000).toISOString() : null,
      };
    });
  } catch (e) { return []; }
}

async function fetchRedditTasks() {
  const items = await fetchRSS('https://old.reddit.com/r/forhire/new/.rss');
  // فلترة بسيطة عشان نجيب اللي فيه كلمة Remote أو Hiring
  return items.filter(i => i.title.toLowerCase().includes('hiring') || i.title.toLowerCase().includes('remote'))
    .map(i => ({ title: i.title, budget: 'Check Post', url: i.url, date: new Date().toISOString() }));
}

async function fetchGuruTasks() {
  const items = await fetchRSS('https://www.guru.com/rss/jobs/');
  return items.map(i => ({ title: i.title, budget: 'Negotiable', url: i.url, date: new Date().toISOString() }));
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
    const res = await fetch('https://jobicy.com/api/v2/remote-jobs?count=10');
    const data = await res.json();
    if (!data || !data.jobs) return [];
    return data.jobs.map(j => {
      let salary = 'Not specified';
      if (j.annualSalaryMin && j.annualSalaryMin > 0) salary = `$${j.annualSalaryMin} - $${j.annualSalaryMax}`;
      return {
        title: j.jobTitle, company: j.companyName, location: j.jobGeo || 'Remote',
        url: j.url, date: j.pubDate ? new Date(j.pubDate).toISOString() : null,
        description: j.jobDescription, salary: salary
      };
    });
  } catch (e) { return []; }
}

// ==========================================
// 4. التشغيل الرئيسي
// ==========================================
async function run() {
  console.log('🚀 بدء التنفيذ...');

  const [fTasks, rTasks, gTasks, rJobs, jJobs] = await Promise.all([
    fetchFreelancer(), fetchRedditTasks(), fetchGuruTasks(), fetchRemoteOK(), fetchJobicy()
  ]);

  let allTasks = [...fTasks, ...rTasks, ...gTasks].filter(t => isRecent(t.date));
  let allJobs = [...rJobs, ...jJobs].filter(j => isRecent(j.date));
  allJobs.sort((a, b) => new Date(b.date) - new Date(a.date));

  // ---------------------------------------------------
  // 1. نشر 3 تاسكات (بفاصل 5 دقايق)
  // ---------------------------------------------------
  console.log(`🎯 تاسكات متاحة: ${allTasks.length}`);
  const tasksToSend = allTasks.slice(0, 3);

  for (let i = 0; i < tasksToSend.length; i++) {
    const t = tasksToSend[i];
    const msg = `🔥 <b>New Remote Task</b>\n━━━━━━━━━━━━━━━\n💼 <b>Title:</b> ${t.title}\n💰 <b>Budget:</b> ${t.budget}\n\n👉 <a href="${t.url}">Apply Here</a>`;
    await sendMessage(msg);
    console.log(`✅ تاسك رقم ${i+1} تم نشره.`);
    
    if (i < tasksToSend.length - 1) {
      console.log('⏳ انتظار 5 دقايق للتاسك التالي...');
      await wait(DELAY_TASKS_MS); // 5 دقايق
    }
  }

  // ---------------------------------------------------
  // 2. نشر وظيفة واحدة فقط إذا مر 8 ساعات
  // ---------------------------------------------------
  let lastJobTime = 0;
  let currentSha = null;

  try {
    const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/contents/job_count.json`);
    if (res.ok) {
      const data = await res.json();
      currentSha = data.sha;
      const countData = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
      if (countData.last_posted_at) lastJobTime = countData.last_posted_at;
    }
  } catch (e) {}

  if (Date.now() - lastJobTime >= EIGHT_HOURS_MS && allJobs.length > 0) {
    const j = allJobs[0];
    const msg = `🚀 <b>Premium Remote Job</b>\n━━━━━━━━━━━━━━━\n💼 <b>Role:</b> ${j.title}\n🏢 <b>Company:</b> ${j.company}\n📍 <b>Location:</b> ${j.location}\n💰 <b>Salary:</b> ${j.salary}\n\n📝 <b>Details:</b>\n${cleanDescription(j.description, j.title, j.company)}\n\n👉 <a href="${j.url}">Apply Here</a>`;
    
    await sendMessage(msg);
    console.log(`✅ تم نشر الوظيفة بنجاح.`);

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
    console.log('⏭️ لسه مكملناش 8 ساعات على آخر وظيفة.');
  }

  console.log('🎉 انتهى التنفيذ.');
}

run().catch(err => {
  console.error("❌ إيرور:", err);
  process.exit(1);
});
