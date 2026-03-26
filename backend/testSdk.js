require("dotenv").config();
const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const chat = ai.chats.create({ model: "gemini-2.5-flash" });

async function test() {
  try {
    console.log("Test 1: String");
    await chat.sendMessage("Hello");
    console.log("Success 1");
  } catch(e) { console.error("Err 1", e.message); }

  try {
    console.log("Test 2: Array with text string");
    await chat.sendMessage(["Hello"]);
    console.log("Success 2");
  } catch(e) { console.error("Err 2", e.message); }

  try {
    console.log("Test 3: Array with functionResponse");
    await chat.sendMessage([{
      functionResponse: { name: "test", response: { result: "ok" } }
    }]);
    console.log("Success 3");
  } catch(e) { console.error("Err 3", e.message); }

  try {
    console.log("Test 4: SendMessageParams format");
    await chat.sendMessage({ message: "Hello" });
    console.log("Success 4");
  } catch(e) { console.error("Err 4", e.message); }

}
test();
