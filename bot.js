const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.GROUP_ID;

// ==========================================
// 1. الإعدادات العامة
// ==========================================
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // فلتر الساعتين
const DELAY_BETWEEN_MESSAGES_MS = 60000; // دقيقة بين كل رسالة

// ==========================================
// 2. دوال مساعدة
// ==========================================
function cleanText(html, maxLength = 250) {
  if (!html) return 'No description provided.';
  let text = html.replace(/<[^>]*>?/gm, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text.substring(0, maxLength) + (text.length > maxLength ? '...' : '');
}

function isRecent(dateString) {
  if (!dateString) return false;
  try {
    const itemDate = new Date(dateString);
    const now = new Date();
    // لو الوقت اللي فات أكتر من ساعتين، يرفضه
    return (now.getTime() - itemDate.getTime()) <= MAX_AGE_MS;
  } catch (e) {
    return false;
  }
}

async function sendMessage(text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHANNEL_ID, text: text, parse_mode: 'Markdown', disable_web_page_preview: true })
  });
}

async function sendPhoto(photoUrl, caption) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHANNEL_ID, photo: photoUrl, caption: caption, parse_mode: 'Markdown' })
  });
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ==========================================
// 3. دوال جلب البيانات (المصادر)
// ==========================================

// أ. Freelancer (تاسكات)
async function fetchFreelancer() {
  try {
    const res = await fetch('https://www.freelancer.com/api/projects/0.1/projects/active/?limit=20&job_details=true');
    const data = await res.json();
    if (!data || !data.result) return [];
    return data.result.projects.map(p => ({
      type: 'task',
      title: p.title,
      budget: p.budget?.minimum ? `$${p.budget.minimum}` : 'Check Link',
      url: `https://www.freelancer.com/projects/${p.seo_url}`,
      date: p.time_submitted ? new Date(p.time_submitted * 1000).toISOString() : null,
      source: 'Freelancer'
    }));
  } catch (e) { return []; }
}

// ب. RemoteOK (وظايف)
async function fetchRemoteOK() {
  try {
    const res = await fetch('https://remoteok.com/api');
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.slice(1).map(j => ({
      type: 'job',
      title: j.position || j.role,
      company: j.company,
      location: j.location || 'Remote',
      url: j.url,
      date: j.date ? new Date(j.date * 1000).toISOString() : null,
      logo: j.company_logo || j.logo,
      description: j.description
    }));
  } catch (e) { return []; }
}

// ج. Jobicy (وظايف)
async function fetchJobicy() {
  try {
    const res = await fetch('https://jobicy.com/api/v2/remote-jobs?count=20');
    const data = await res.json();
    if (!data || !data.jobs) return [];
    return data.jobs.map(j => ({
      type: 'job',
      title: j.jobTitle,
      company: j.companyName,
      location: j.jobGeo || 'Remote',
      url: j.url,
      date: j.pubDate ? new Date(j.pubDate).toISOString() : null,
      logo: j.companyLogo || null,
      description: j.jobDescription
    }));
  } catch (e) { return []; }
}

// د. Himalayas (وظايف)
async function fetchHimalayas() {
  try {
    const res = await fetch('https://himalayas.app/jobs/api?limit=20');
    const data = await res.json();
    if (!data || !data.jobs) return [];
    return data.jobs.map(j => ({
      type: 'job',
      title: j.title,
      company: j.companyName || j.company,
      location: j.location || 'Remote',
      url: j.applicationLink || j.url,
      date: j.pubDate ? new Date(j.pubDate).toISOString() : null,
      logo: j.companyLogo || null,
      description: j.description
    }));
  } catch (e) { return []; }
}

// هـ. Arbeitnow (وظايف)
async function fetchArbeitnow() {
  try {
    const res = await fetch('https://www.arbeitnow.com/api/job-board-api');
    const data = await res.json();
    if (!data || !data.data) return [];
    return data.data.map(j => ({
      type: 'job',
      title: j.title,
      company: j.company_name,
      location: j.location || 'Remote',
      url: j.url,
      date: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
      logo: null,
      description: j.description
    }));
  } catch (e) { return []; }
}

// ==========================================
// 4. الدالة الرئيسية
// ==========================================
async function run() {
  console.log('🚀 بدء سحب البيانات...');

  // سحب من كل المصادر في نفس الوقت
  const [
    freelancerTasks,
    remoteOkJobs,
    jobicyJobs,
    himalayasJobs,
    arbeitnowJobs
  ] = await Promise.all([
    fetchFreelancer(),
    fetchRemoteOK(),
    fetchJobicy(),
    fetchHimalayas(),
    fetchArbeitnow()
  ]);

  let allTasks = freelancerTasks;
  let allJobs = [...remoteOkJobs, ...jobicyJobs, ...himalayasJobs, ...arbeitnowJobs];

  // فلترة العناصر اللي فات عليها أكتر من ساعتين
  allTasks = allTasks.filter(t => isRecent(t.date));
  allJobs = allJobs.filter(j => isRecent(j.date));

  console.log(`✅ تاسكات جديدة: ${allTasks.length} | وظايف جديدة: ${allJobs.length}`);

  // 1. إرسال 3 تاسكات
  const tasksToSend = allTasks.slice(0, 3);
  for (const t of tasksToSend) {
    const msg = `🔥 *Task:* ${t.title}\n💰 *Budget:* ${t.budget}\n🔗 [Apply Here](${t.url})`;
    await sendMessage(msg);
    console.log(`✅ تم إرسال تاسك: ${t.title.substring(0, 30)}...`);
    await wait(DELAY_BETWEEN_MESSAGES_MS); // استنى دقيقة
  }

  // 2. إرسال وظيفة واحدة مع صورة لو موجودة
  const jobsToSend = allJobs.slice(0, 1);
  for (const j of jobsToSend) {
    const desc = cleanText(j.description, 200);
    const caption = `🚀 *Job:* ${j.title}\n🏢 *Company:* ${j.company}\n🔗 [Apply Here](${j.url})\n\n${desc}`;
    
    if (j.logo) {
      await sendPhoto(j.logo, caption);
    } else {
      await sendMessage(caption);
    }
    console.log(`✅ تم إرسال وظيفة: ${j.title.substring(0, 30)}...`);
    await wait(DELAY_BETWEEN_MESSAGES_MS);
  }

  console.log('🎉 انتهى التنفيذ.');
}

run();
