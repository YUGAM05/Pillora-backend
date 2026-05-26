"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatWithAI = void 0;
const drugDatabase_1 = require("../data/drugDatabase");
const generative_ai_1 = require("@google/generative-ai");
const genAI = process.env.GEMINI_API_KEY ? new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
// Smart Responses Fallback
const SMART_RESPONSES = {
    "hello": "Hello! I'm your Pillora assistant. I can help you find medicines, check blood availability, or answer questions about your orders. What's on your mind?",
    "hi": "Hi there! How can Pillora assist you with your health today?",
    "apex care": "Pillora is your all-in-one healthcare destination! 🏥 We provide a comprehensive e-pharmacy with 2000+ medicines, a real-time blood bank registry, verified hospital & ambulance directories, and an AI-powered safety checker. Our mission is to make healthcare accessible, affordable, and safe for everyone.",
    "who are you": "I am the Pillora AI Assistant, powered by advanced medical intelligence. I'm here to help you navigate our platform, check drug safety, find blood donors, and provide general health information.",
    "blood": "You can check blood availability in our [Blood Bank](/blood-bank) section. We have a real-time registry of donors and requests. Would you like me to help you find a specific blood group?",
    "order": "You can track your orders in your [Profile Dashboard](/my-donor-profile). If you have a specific order ID, I can try to find more details for you.",
    "medicine": "We have a database of over 2000 medicines! You can search for them on our [Home Page](/) or use our [AI Safety Checker](/ai-safety-checker) to see if a medication is right for your symptoms.",
    "emergency": "If you are experiencing a medical emergency, please call your local emergency services (like 102 or 108) immediately.",
    "help": "I can help with: \n1. Finding medications and checking safety using our [Safety Checker](/ai-safety-checker).\n2. Checking [Blood Bank](/blood-bank) registry.\n3. Helping with platform navigation.\n4. Providing general health tips in the [Health Hub](/health-hub).",
    "fever": "For a fever, it's important to rest and stay hydrated. You might consider common over-the-counter medications like [Paracetamol](http://localhost:3000/products/paracetamol) or [Ibuprofen](http://localhost:3000/products/ibuprofen) if appropriate. Please consult a doctor if the fever is high or persistent.",
    "headache": "Headaches can be caused by many factors. Resting in a quiet, dark room and staying hydrated can help. Over-the-counter pain relief like [Aspirin](http://localhost:3000/products/aspirin) or [Paracetamol](http://localhost:3000/products/paracetamol) may be used. If the pain is severe or sudden, please seek medical attention.",
    "cough": "For a cough, staying hydrated and using honey or steam can provide relief. You can browse our [Cough & Cold](http://localhost:3000/medicines) section for remedies. If you have difficulty breathing, seek emergency care.",
    "ayushman": "Yes! We support Ayushman Bharat and other government health schemes. You can find verified [Hospitals](/hospitals) in our directory.",
};
const chatWithAI = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { message, history, userContext } = req.body;
        if (!message) {
            res.status(400).json({ message: 'Message is required' });
            return;
        }
        const lowerMsg = message.toLowerCase();
        let reply = "";
        // 1. Contextual Drug Search
        const foundDrug = drugDatabase_1.DRUG_DATABASE.find(d => lowerMsg.includes(d.name.toLowerCase()) ||
            lowerMsg.includes(d.genericName.toLowerCase()));
        let drugContext = "";
        if (foundDrug) {
            drugContext = `\nINTERNAL DATABASE MATCH: ${foundDrug.name} (${foundDrug.category}). Treats: ${foundDrug.treatsSymptoms.join(', ')}. Dosage: ${foundDrug.dosage.adult}. Warnings: ${foundDrug.warnings.join(', ')}.`;
        }
        // 2. Gemini AI Integration
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey) {
            try {
                const client = new generative_ai_1.GoogleGenerativeAI(apiKey);
                const userName = (userContext === null || userContext === void 0 ? void 0 : userContext.name) || 'User';
                // Try 1.5-flash first, then fallback to pro
                const modelNames = ["gemini-1.5-flash", "gemini-pro"];
                let lastError = null;
                for (const modelName of modelNames) {
                    try {
                        const model = client.getGenerativeModel({
                            model: modelName,
                            systemInstruction: `You are the Pillora Medical Intelligence Engine.
                            NAME: ${userName}
                            CONTEXT: ${drugContext}
                            MISSION: Provide accurate, professional health advice. Use Markdown. Link to platform: [Pharmacy](http://localhost:3000/), [Hospital](http://localhost:3000/hospitals), [Blood Bank](http://localhost:3000/blood-bank), [Safety Checker](http://localhost:3000/safety-checker).
                            RULES: Be comprehensive. If asking about a condition (like fever), explain causes and suggest remedies while urging doctor consultation.`
                        });
                        const chat = model.startChat({ history: history || [] });
                        const result = yield chat.sendMessage(message);
                        reply = result.response.text();
                        if (reply)
                            break;
                    }
                    catch (err) {
                        lastError = err;
                        console.error(`Gemini model ${modelName} failed:`, err.message);
                        continue;
                    }
                }
            }
            catch (rootAiError) {
                console.error("Gemini root error:", rootAiError);
            }
        }
        // 3. Keyword-Based Fallback
        if (!reply) {
            for (const [key, response] of Object.entries(SMART_RESPONSES)) {
                if (lowerMsg.includes(key)) {
                    reply = response;
                    break;
                }
            }
        }
        // 4. Final Fallback
        if (!reply) {
            reply = "I understand you're asking about something specific. While I'm connecting to my full medical knowledge base, I can tell you that Pillora is here to support your health with our Pharmacy, Blood Bank, and Hospital services. How can I best help you today?";
        }
        res.json({ reply });
    }
    catch (error) {
        console.error('AI Chat Controller Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});
exports.chatWithAI = chatWithAI;
