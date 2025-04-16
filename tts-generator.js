// multilingual-tts-generator.js
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
fetch("/api/get-key")
  .then((res) => res.json())
  .then((data) => {
    const API_KEY = data.key;
    // Use apiKey for your API calls here
  });

// Language configurations
const languages = [
  {
    code: "hinglish",
    voice: "shimmer",
    instructions:
      "Speak in a calm, gentle hinglish tone. Speak clearly but softly.",
    completionMessage:
      "धन्यवाद! आपका फॉर्म पूरा हो गया है। Thank you for completing the form.",
    questionsFile: "./questions-hinglish.json",
    outputDir: "./audio/hinglish",
  },
  {
    code: "english",
    voice: "shimmer",
    instructions:
      "Speak in a calm, professional English tone. Speak clearly but softly.",
    completionMessage:
      "Thank you for completing the form. Your responses have been recorded.",
    questionsFile: "./questions-english.json",
    outputDir: "./audio/english",
  },
  {
    code: "kannada",
    voice: "shimmer",
    instructions:
      "Speak in a calm, gentle tone Kanglish (Kannada and English). Speak clearly but softly.",
    completionMessage:
      "ಧನ್ಯವಾದಗಳು! ನೀವು ಫಾರ್ಮ್ ಅನ್ನು ಪೂರ್ಣಗೊಳಿಸಿದ್ದೀರಿ. Thank you for completing the form.",
    questionsFile: "./questions-kannada.json",
    outputDir: "./audio/kannada",
  },
];

async function generateTTS(text, filename, language) {
  console.log(
    `Generating TTS for ${language.code}: ${text.substring(0, 30)}...`
  );

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: language.voice,
        input: text,
        instructions: language.instructions,
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    // Get the audio data as a buffer
    const buffer = await response.buffer();

    // Ensure directory exists
    if (!fs.existsSync(language.outputDir)) {
      fs.mkdirSync(language.outputDir, { recursive: true });
    }

    // Write the file
    fs.writeFileSync(path.join(language.outputDir, filename), buffer);
    console.log(`Saved: ${language.code}/${filename}`);

    // Add a delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    console.error(`Error generating TTS for ${filename}:`, error);
  }
}

async function processLanguage(language) {
  console.log(`Processing ${language.code} language...`);

  // Load questions for this language
  const questions = require(language.questionsFile);

  // Flatten categories to get all questions
  let allQuestions = [];
  questions.forEach((category) => {
    category.questions.forEach((question) => {
      allQuestions.push({
        id: question.id,
        text: question.text,
        required: question.required,
        type: question.type,
        options: question.options,
      });
    });
  });

  // Generate TTS for each question
  for (const question of allQuestions) {
    let textToSpeak = question.text;

    // Add mention of optional status
    if (question.required === false) {
      if (language.code === "english") {
        textToSpeak += " This question is optional.";
      } else if (language.code === "hinglish") {
        textToSpeak += " Yeh question optional hai.";
      } else if (language.code === "kannada") {
        textToSpeak += " ಈ ಪ್ರಶ್ನೆ ಐಚ್ಛಿಕವಾಗಿದೆ.";
      }
    }

    // Customize text based on question type
    if (question.type === "file") {
      if (language.code === "english") {
        textToSpeak += " Please tap the upload area to select a file.";
      } else if (language.code === "hinglish") {
        textToSpeak +=
          " File upload karne ke liye, upload area par tap karein.";
      } else if (language.code === "kannada") {
        textToSpeak +=
          " ಫೈಲ್ ಅಪ್‌ಲೋಡ್ ಮಾಡಲು, ಅಪ್‌ಲೋಡ್ ಪ್ರದೇಶವನ್ನು ಟ್ಯಾಪ್ ಮಾಡಿ.";
      }
    } else if (question.type === "otp") {
      if (language.code === "english") {
        textToSpeak +=
          " Please enter the verification code sent to your device.";
      } else if (language.code === "hinglish") {
        textToSpeak +=
          " Aapke device par bheje gaye verification code ko darj karein.";
      } else if (language.code === "kannada") {
        textToSpeak += " ನಿಮ್ಮ ಸಾಧನಕ್ಕೆ ಕಳುಹಿಸಲಾದ ಪರಿಶೀಲನೆ ಕೋಡ್ ಅನ್ನು ನಮೂದಿಸಿ.";
      }
    } else if (question.type === "dropdown") {
      if (language.code === "english") {
        textToSpeak += " Please select an option from the dropdown menu.";
      } else if (language.code === "hinglish") {
        textToSpeak += " Dropdown menu se ek option select karein.";
      } else if (language.code === "kannada") {
        textToSpeak += " ಡ್ರಾಪ್‌ಡೌನ್ ಮೆನುವಿನಿಂದ ಒಂದು ಆಯ್ಕೆಯನ್ನು ಆರಿಸಿ.";
      }
    } else if (question.type === "multiple_choice") {
      if (language.code === "english") {
        textToSpeak += " Options are: " + question.options.join(", ");
      } else if (language.code === "hinglish") {
        textToSpeak += " Options hain: " + question.options.join(", ");
      } else if (language.code === "kannada") {
        textToSpeak += " ಆಯ್ಕೆಗಳು: " + question.options.join(", ");
      }
    }

    // Generate filename
    const filename = `${question.id}.mp3`;

    await generateTTS(textToSpeak, filename, language);
  }

  // Generate completion message
  await generateTTS(language.completionMessage, "completion.mp3", language);

  console.log(`Completed processing ${language.code} language!`);
}

async function generateAllTTS() {
  for (const language of languages) {
    await processLanguage(language);
  }
  console.log("All language TTS files generated successfully!");
}

generateAllTTS();
