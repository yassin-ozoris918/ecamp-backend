const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: 'AQ.Ab8RN6KuTk_Hr5jQil0SpfhznVHu3YVE3V-SgU5vXFwzf0WGDg' });

async function test() {
  try {
    const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: 'Test message',
    });
    console.log(response.text);
  } catch (e) {
    console.error('Error:', e);
  }
}

test();
