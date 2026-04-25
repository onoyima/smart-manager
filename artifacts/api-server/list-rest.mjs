const apiKey = process.env.GEMINI_API_KEY;

async function list() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const resp = await fetch(url);
  const data = await resp.json();
  console.log(JSON.stringify(data, null, 2));
}

list();
