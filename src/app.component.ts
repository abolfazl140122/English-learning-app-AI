/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {
  ChangeDetectionStrategy,
  Component,
  signal,
  effect,
  viewChild,
  ElementRef,
  inject,
  computed,
} from '@angular/core';
import { GoogleGenAI, Chat, Type } from '@google/genai';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface HomeContent {
  tips: { title: string; description: string }[];
  challenge: string;
}

interface QuizQuestion {
  question: string;
  options: string[];
  correct_answer: string;
}

interface VocabularyQuizQuestion extends QuizQuestion {
  definition: string;
}

interface QuizResultSummary {
  score: number;
  total: number;
  feedback: string;
  wordsToReview: {
    question: string;
    yourAnswer: string | null;
    correctAnswer: string;
    definition: string;
  }[];
}

type EnglishLevel = 'Beginner' | 'Intermediate' | 'Advanced';

interface TestResult {
  level: EnglishLevel;
  feedback: string;
}

const translations = {
  en: {
    welcome: 'Welcome!',
    whatToCallYou: 'What should we call you?',
    enterYourName: 'Enter your name',
    letsStart: "Let's Start",
    aiAssistant: 'AI Assistant',
    online: 'Online',
    typeYourMessage: 'Type or say something...',
    clearChat: 'Clear Chat',
    confirmClearChat: 'Are you sure you want to clear the entire conversation?',
    connecting: 'Connecting to AI...',
    toggleThemeLight: 'Switch to Light Theme',
    toggleThemeDark: 'Switch to Dark Theme',
    home: 'Home',
    chat: 'Chat',
    backToHome: 'Back to Home',
    dailyTips: 'Daily Tips',
    todaysChallenge: "Today's Challenge",
    welcomeBack: 'Welcome back',
    learnSomethingNew: "Let's learn something new today.",
    startChallenge: 'Start Challenge',
    quickActions: 'Quick Actions',
    practiceConversation: 'Practice Conversation',
    vocabularyQuiz: 'Vocabulary Quiz',
    comingSoon: 'Coming Soon',
    placementTest: 'Placement Test',
    selectCorrectAnswer: 'Choose the best option to complete the sentence.',
    nextQuestion: 'Next Question',
    finishTest: 'Finish Test',
    testComplete: 'Test Complete!',
    yourLevelIs: "We've determined your level is:",
    startLearning: "Let's Start Learning!",
    generatingTest: 'Generating Your Test...',
    evaluatingTest: 'Evaluating Your Answers...',
    pleaseWait: 'This will just take a moment.',
    startRecording: 'Start Recording',
    stopRecording: 'Stop Recording',
    speakText: 'Read message aloud',
    generatingQuiz: 'Crafting Your Quiz...',
    quizProgress: 'Question {number} of {total}',
    correct: 'Correct!',
    incorrect: 'Not quite.',
    correctAnswerIs: 'The correct answer is:',
    quizComplete: 'Quiz Complete!',
    yourScore: 'Your Score',
    wordsToReview: 'Words to Review',
    tryAgain: 'Try Again',
  },
  fa: {
    welcome: 'خوش آمدید!',
    whatToCallYou: 'شما را چه بنامیم؟',
    enterYourName: 'نام خود را وارد کنید',
    letsStart: 'شروع کنیم',
    aiAssistant: 'دستیار هوش مصنوعی',
    online: 'آنلاین',
    typeYourMessage: 'پیام خود را تایپ یا بیان کنید...',
    clearChat: 'پاک کردن گفتگو',
    confirmClearChat: 'آیا از پاک کردن کل گفتگو مطمئن هستید؟',
    connecting: 'در حال آماده سازی هوش مصنوعی',
    toggleThemeLight: 'تغییر به تم روشن',
    toggleThemeDark: 'تغییر به تم تاریک',
    home: 'خانه',
    chat: 'گفتگو',
    backToHome: 'بازگشت به خانه',
    dailyTips: 'نکات روزانه',
    todaysChallenge: 'چالش امروز',
    welcomeBack: 'خوش برگشتی',
    learnSomethingNew: 'بیا امروز یه چیز جدید یاد بگیریم.',
    startChallenge: 'شروع چالش',
    quickActions: 'دسترسی سریع',
    practiceConversation: 'تمرین مکالمه',
    vocabularyQuiz: 'آزمون واژگان',
    comingSoon: 'به زودی',
    placementTest: 'آزمون تعیین سطح',
    selectCorrectAnswer: 'بهترین گزینه را برای تکمیل جمله انتخاب کنید.',
    nextQuestion: 'سوال بعدی',
    finishTest: 'پایان آزمون',
    testComplete: 'آزمون تمام شد!',
    yourLevelIs: 'سطح شما مشخص شد:',
    startLearning: 'بزن بریم یاد بگیریم!',
    generatingTest: 'در حال ساخت آزمون شما...',
    evaluatingTest: 'در حال تحلیل پاسخ‌های شما...',
    pleaseWait: 'این کار فقط یک لحظه طول می‌کشد.',
    startRecording: 'شروع ضبط',
    stopRecording: 'توقف ضبط',
    speakText: 'خواندن پیام',
    generatingQuiz: 'در حال آماده‌سازی آزمون...',
    quizProgress: 'سوال {number} از {total}',
    correct: 'درست!',
    incorrect: 'دقیق نبود.',
    correctAnswerIs: 'پاسخ صحیح:',
    quizComplete: 'آزمون تمام شد!',
    yourScore: 'امتیاز شما',
    wordsToReview: 'واژه‌هایی برای مرور',
    tryAgain: 'تلاش مجدد',
  },
};

type Theme = 'light' | 'dark';
type AppState = 'loading' | 'languageSelection' | 'onboarding' | 'placementTest' | 'home' | 'chatting' | 'vocabularyQuiz';
type PlacementTestState = 'generating' | 'taking' | 'evaluating' | 'results';
type VocabularyQuizState = 'generating' | 'taking' | 'results';
// This is a browser-specific API.
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': `(appState() === 'chatting' || appState() === 'home')
      ? 'flex justify-center h-screen w-full bg-gray-100 dark:bg-slate-900'
      : 'flex items-center justify-center h-screen p-4 bg-gray-100 dark:bg-slate-900'`,
  },
})
export class AppComponent {
  appState = signal<AppState>('loading');
  uiLanguage = signal<'en' | 'fa'>('en');
  theme = signal<Theme>('dark');
  userName = signal<string>('');
  messages = signal<Message[]>([]);
  userInput = signal<string>('');
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);
  chatContainer = viewChild<ElementRef>('chatContainer');
  
  // Home screen state
  homeContent = signal<HomeContent | null>(null);
  homeIsLoading = signal<boolean>(false);
  homeError = signal<string | null>(null);

  // Placement Test State
  englishLevel = signal<EnglishLevel | null>(null);
  placementTestState = signal<PlacementTestState>('generating');
  testQuestions = signal<QuizQuestion[]>([]);
  currentQuestionIndex = signal<number>(0);
  userAnswers = signal<(string | null)[]>([]);
  selectedAnswer = signal<string | null>(null);
  testResult = signal<TestResult | null>(null);

  // Vocabulary Quiz State
  vocabularyQuizState = signal<VocabularyQuizState>('generating');
  vocabularyQuestions = signal<VocabularyQuizQuestion[]>([]);
  currentVocabularyQuestionIndex = signal<number>(0);
  selectedVocabularyAnswer = signal<string | null>(null);
  userVocabularyAnswers = signal<(string | null)[]>([]);
  vocabularyQuizResult = signal<QuizResultSummary | null>(null);
  isAnswerChecked = signal<boolean>(false);

  // Speech Recognition and Synthesis
  isRecording = signal<boolean>(false);
  currentlySpeakingText = signal<string | null>(null);
  speechSupported = signal<boolean>(!!SpeechRecognition);
  private recognition: any | null = null;

  t = computed(() => translations[this.uiLanguage()]);
  currentQuestion = computed(() => this.testQuestions()[this.currentQuestionIndex()]);
  testProgress = computed(() => this.testQuestions().length > 0 ? ((this.currentQuestionIndex()) / this.testQuestions().length) * 100 : 0);
  
  currentVocabularyQuestion = computed(() => this.vocabularyQuestions()[this.currentVocabularyQuestionIndex()]);
  vocabularyQuizProgress = computed(() => this.vocabularyQuestions().length > 0 ? ((this.currentVocabularyQuestionIndex() + 1) / this.vocabularyQuestions().length) * 100 : 0);

  private chat!: Chat;
  private ai!: GoogleGenAI;
  private sanitizer = inject(DomSanitizer);

  constructor() {
    this.initializeTheme();
    this.initializeSpeechRecognition();

    setTimeout(() => {
      const storedName = localStorage.getItem('userName');
      const storedLang = localStorage.getItem('uiLanguage') as 'en' | 'fa' | null;
      const storedLevel = localStorage.getItem('englishLevel') as EnglishLevel | null;

      if (storedName && storedLang) {
        this.userName.set(storedName);
        this.uiLanguage.set(storedLang);
        if (storedLevel) {
          this.englishLevel.set(storedLevel);
          this.appState.set('home');
        } else {
          this.appState.set('placementTest');
        }
      } else {
        this.appState.set('languageSelection');
      }
    }, 2500);

    effect(() => {
      if (this.messages().length && this.chatContainer()) {
        this.scrollToBottom();
      }
    });

    effect(() => {
      const state = this.appState();
      if ((state === 'home' || state === 'chatting') && this.userName() && !this.chat) {
        this.initializeChat();
      }
      if (state === 'home' && !this.homeContent() && !this.homeIsLoading()) {
        this.loadHomeContent();
      }
      if (state === 'placementTest' && this.testQuestions().length === 0) {
        this.generatePlacementTest();
      }
    });
    
    effect(() => {
      if (this.messages().length > 0) {
        localStorage.setItem('chatHistory', JSON.stringify(this.messages()));
      }
    });
    
    effect(() => {
      const currentTheme = this.theme();
      if (currentTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('theme', currentTheme);
    });
  }

  initializeTheme() {
    const storedTheme = localStorage.getItem('theme') as Theme | null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.theme.set(storedTheme || (prefersDark ? 'dark' : 'light'));
  }

  toggleTheme() {
    this.theme.update(current => (current === 'dark' ? 'light' : 'dark'));
  }

  selectLanguage(lang: 'en' | 'fa'): void {
    this.uiLanguage.set(lang);
    localStorage.setItem('uiLanguage', lang);
    this.appState.set('onboarding');
  }
  
  navigateTo(view: 'home' | 'chatting'): void {
    if (view === 'home') {
        // Reset quiz state when navigating home
        this.vocabularyQuestions.set([]);
    }
    this.appState.set(view);
  }

  async initializeChat(): Promise<void> {
    if (!process.env.API_KEY) {
      this.error.set('API key not configured. Please set API_KEY.');
      return;
    }

    if (!this.ai) {
        this.ai = new GoogleGenAI({apiKey: process.env.API_KEY});
    }

    const systemInstruction = `You are a friendly and supportive AI English tutor. The user you are talking to is named ${this.userName()}, and their estimated English proficiency is ${this.englishLevel()}.

    Core Directives:
    - Language: All your responses MUST be in English.
    - Adaptability: Tailor the complexity of your vocabulary and sentence structures to the user's ${this.englishLevel()} level.
      - For Beginners: Use simple words, short sentences, and ask clear, direct questions.
      - For Intermediate: Introduce more nuanced vocabulary and slightly more complex sentences. Encourage them to elaborate.
      - For Advanced: Engage in deep, complex conversations. Feel free to use idiomatic expressions (and explain them if necessary).
    - Corrections: Gently correct major grammatical mistakes. Don't interrupt the flow of conversation for minor errors. Phrase corrections positively, for example: "That's a great point! A slightly more natural way to say that would be..."
    - Encouragement: Be positive and encouraging. Praise their effort.
    - Formatting: Use Markdown for formatting (like bolding key terms or using lists) to improve readability.
    - Greeting: Begin your very first message in a new conversation with a friendly greeting, like "Hi ${this.userName()}! Ready to practice some English today?".`;
      
    this.chat = this.ai.chats.create({
      model: 'gemini-2.5-flash',
      config: { systemInstruction },
    });
    
    const storedHistory = localStorage.getItem('chatHistory');
    if (storedHistory && JSON.parse(storedHistory).length > 0) {
      this.messages.set(JSON.parse(storedHistory));
    } else {
       // Send initial greeting from AI
      this.isLoading.set(true);
      const result = await this.chat.sendMessageStream({ message: `Hi, please greet me.` });
      this.messages.set([{ role: 'model', text: '' }]);
      let streamingText = '';
      for await (const chunk of result) {
        streamingText += chunk.text;
        this.messages.update(current => {
          current[0].text = streamingText;
          return [...current];
        });
      }
      this.isLoading.set(false);
    }
  }
  
  handleNameSubmit(event: Event) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const input = form.querySelector('input');
    const name = input?.value.trim();
    if (name) {
      localStorage.setItem('userName', name);
      this.userName.set(name);
      this.appState.set('placementTest');
    }
  }

  async generatePlacementTest(): Promise<void> {
    this.homeError.set(null);
    this.placementTestState.set('generating');
    try {
      if (!this.ai) {
        this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      }

      const schema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correct_answer: { type: Type.STRING },
          },
          required: ['question', 'options', 'correct_answer'],
        },
      };

      const prompt = `You are an expert English language assessment creator. Generate a 5-question multiple-choice placement test to determine a user's English proficiency. The questions should cover grammar and vocabulary.
- Create one question for each of the following CEFR levels, in this order: A1, A2, B1, B2, C1.
- Each question must have a 'question' text, an array of exactly 4 string 'options', and the 'correct_answer' string which must be one of the options.
- Respond ONLY with a valid JSON array adhering to the provided schema. Do not include any other text or markdown.`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      });

      const questions = JSON.parse(response.text.trim());
      this.testQuestions.set(questions);
      this.placementTestState.set('taking');
    } catch (e) {
      this.handleError(e, 'home');
    }
  }

  selectAnswer(answer: string): void {
    this.selectedAnswer.set(answer);
  }

  submitAnswer(): void {
    if (!this.selectedAnswer()) return;

    this.userAnswers.update(answers => [...answers, this.selectedAnswer()]);
    
    if (this.currentQuestionIndex() < this.testQuestions().length - 1) {
      this.currentQuestionIndex.update(i => i + 1);
      this.selectedAnswer.set(null);
    } else {
      this.evaluateTest();
    }
  }

  async evaluateTest(): Promise<void> {
    this.placementTestState.set('evaluating');
    this.homeError.set(null);
    try {
       const questionsAndAnswers = this.testQuestions().map((q, i) => ({
        question: q.question,
        correct_answer: q.correct_answer,
        user_answer: this.userAnswers()[i]
      }));

      const schema = {
        type: Type.OBJECT,
        properties: {
          level: { type: Type.STRING, enum: ['Beginner', 'Intermediate', 'Advanced'] },
          feedback: { type: Type.STRING }
        },
        required: ['level', 'feedback']
      };

      const languageMap = { en: 'English', fa: 'Persian (Farsi)' };
      const requestedLang = languageMap[this.uiLanguage()];

      const prompt = `You are an expert English language assessment evaluator. A user has completed a placement test.
      Here are the questions, correct answers, and the user's answers:
      ${JSON.stringify(questionsAndAnswers)}
      
      Based on their performance, determine their English proficiency level. The level must be one of: 'Beginner', 'Intermediate', or 'Advanced'.
      Also, provide a short, encouraging feedback message (max 30 words) for the user in ${requestedLang}.
      
      Respond ONLY with a valid JSON object with two keys: 'level' (the determined proficiency level) and 'feedback' (the feedback message). Do not include any other text or markdown.`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      });
      
      const result = JSON.parse(response.text.trim()) as TestResult;
      this.testResult.set(result);
      this.englishLevel.set(result.level);
      localStorage.setItem('englishLevel', result.level);
      this.placementTestState.set('results');

    } catch (e) {
      this.handleError(e, 'home');
      this.placementTestState.set('taking'); // Go back to test if evaluation fails
    }
  }

  finishTestAndGoHome(): void {
    this.appState.set('home');
  }


  async loadHomeContent(): Promise<void> {
    if (!this.userName() || !process.env.API_KEY) {
      this.homeError.set('User name not found or API key not configured.');
      return;
    }
    this.homeIsLoading.set(true);
    this.homeError.set(null);

    try {
        if (!this.ai) {
             this.ai = new GoogleGenAI({apiKey: process.env.API_KEY});
        }
        
        const languageMap = {
          en: 'English',
          fa: 'Persian (Farsi)',
        };
        const requestedLang = languageMap[this.uiLanguage()];

        const schema = {
          type: Type.OBJECT,
          properties: {
            tips: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING, description: 'A short, catchy title (max 5 words).' },
                  description: { type: Type.STRING, description: 'A brief description (max 20 words).' }
                },
                required: ['title', 'description']
              }
            },
            challenge: { type: Type.STRING, description: 'A short challenge paragraph (max 50 words).' }
          },
          required: ['tips', 'challenge']
        };

        const prompt = `You are an AI assistant for an English learning app. The user's name is ${this.userName()}, their proficiency is ${this.englishLevel()}, and their selected UI language is ${requestedLang}. Your task is to generate motivational and engaging content for the app's home screen, IN ${requestedLang}.
Provide the following in a JSON object:
1. 'tips': An array of 3 'Daily Tips' for learning English, tailored to a ${this.englishLevel()} learner. Each tip should have a 'title' and a 'description'.
2. 'challenge': A "Today's Challenge", which is a short, actionable task appropriate for a ${this.englishLevel()} user.

Respond ONLY with a valid JSON object that adheres to the provided schema. Your entire response, including all text in the tips and challenge, MUST be in ${requestedLang}. Do not include any other text or markdown formatting.`;

        const response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: schema,
            },
        });

        const jsonString = response.text.trim();
        const content = JSON.parse(jsonString);
        this.homeContent.set(content);

    } catch (e) {
        this.handleError(e, 'home');
    } finally {
        this.homeIsLoading.set(false);
    }
  }

  async sendMessage(): Promise<void> {
    const userMessageText = this.userInput();
    if (!userMessageText.trim() || this.isLoading()) {
      return;
    }
    
    this.messages.update(current => [
      ...current,
      { role: 'user', text: userMessageText },
    ]);
    this.userInput.set('');
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const result = await this.chat.sendMessageStream({ message: userMessageText });

      this.messages.update(current => [...current, { role: 'model', text: '' }]);
      let streamingText = '';
      for await (const chunk of result) {
        streamingText += chunk.text;
        this.messages.update(current => {
          const lastMessage = current[current.length - 1];
          lastMessage.text = streamingText;
          return [...current];
        });
      }
    } catch (e) {
      this.handleError(e);
    } finally {
      this.isLoading.set(false);
    }
  }
  
  // --- Vocabulary Quiz Methods ---

  startVocabularyQuiz(): void {
    // Reset state
    this.vocabularyQuizState.set('generating');
    this.vocabularyQuestions.set([]);
    this.currentVocabularyQuestionIndex.set(0);
    this.selectedVocabularyAnswer.set(null);
    this.userVocabularyAnswers.set([]);
    this.vocabularyQuizResult.set(null);
    this.isAnswerChecked.set(false);
    this.homeError.set(null);

    this.appState.set('vocabularyQuiz');
    this.generateVocabularyQuiz();
  }

  async generateVocabularyQuiz(): Promise<void> {
    try {
      if (!this.ai) {
        this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      }

      const schema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correct_answer: { type: Type.STRING },
            definition: { type: Type.STRING },
          },
          required: ['question', 'options', 'correct_answer', 'definition'],
        },
      };

      const prompt = `You are an expert English language assessment creator. Generate a 5-question multiple-choice vocabulary quiz for a user with an English proficiency level of '${this.englishLevel()}'.
      - Each question should test knowledge of a specific word by providing a definition or a sentence with a blank.
      - Each item must have: a 'question' text, an array of exactly 4 'options' (plausible distractors), the 'correct_answer' string (must be one of the options), and a short 'definition' of the correct answer.
      - Respond ONLY with a valid JSON array.`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json', responseSchema: schema },
      });

      const questions = JSON.parse(response.text.trim());
      this.vocabularyQuestions.set(questions);
      this.vocabularyQuizState.set('taking');
    } catch (e) {
      this.handleError(e, 'home');
      this.appState.set('home'); // Go home on error
    }
  }

  selectVocabularyAnswer(answer: string): void {
    if (this.isAnswerChecked()) return;
    this.selectedVocabularyAnswer.set(answer);
    this.isAnswerChecked.set(true);
  }

  nextVocabularyQuestion(): void {
    this.userVocabularyAnswers.update(answers => [...answers, this.selectedVocabularyAnswer()]);

    if (this.currentVocabularyQuestionIndex() < this.vocabularyQuestions().length - 1) {
      this.currentVocabularyQuestionIndex.update(i => i + 1);
      this.selectedVocabularyAnswer.set(null);
      this.isAnswerChecked.set(false);
    } else {
      this.showVocabularyQuizResults();
    }
  }

  async showVocabularyQuizResults(): Promise<void> {
    const questions = this.vocabularyQuestions();
    const userAnswers = this.userVocabularyAnswers();
    let score = 0;
    const wordsToReview: { question: string; yourAnswer: string | null; correctAnswer: string; definition: string }[] = [];

    questions.forEach((q, i) => {
      const userAnswer = userAnswers[i] ?? null;
      if (q.correct_answer === userAnswer) {
        score++;
      } else {
        wordsToReview.push({
          question: q.question,
          yourAnswer: userAnswer,
          correctAnswer: q.correct_answer,
          definition: q.definition,
        });
      }
    });

    let feedback = `Good job! You got ${score} out of ${questions.length}.`;
    try {
      const languageMap = { en: 'English', fa: 'Persian (Farsi)' };
      const requestedLang = languageMap[this.uiLanguage()];
      const prompt = `An English learner at a ${this.englishLevel()} level scored ${score} out of ${questions.length} on a vocabulary quiz. Write a short, encouraging feedback message (max 25 words) in ${requestedLang}. Respond ONLY with the feedback text.`;
      
      const response = await this.ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      feedback = response.text.trim();
    } catch (e) {
      console.error("Failed to generate quiz feedback:", e);
    }

    this.vocabularyQuizResult.set({ score, total: questions.length, feedback, wordsToReview });
    this.vocabularyQuizState.set('results');
  }

  getOptionClass(option: string, correctAnswer: string): string {
    const base = 'bg-white/50 dark:bg-slate-700/50 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600';
    const hover = 'hover:bg-indigo-100 dark:hover:bg-slate-700';
    const selected = 'bg-indigo-600 text-white border-transparent ring-2 ring-indigo-400';
    const correct = '!bg-green-500 !text-white !border-transparent';
    const incorrect = '!bg-red-500 !text-white !border-transparent';
    const disabled = 'disabled:opacity-70';

    if (this.isAnswerChecked()) {
      if (option === correctAnswer) return correct;
      if (option === this.selectedVocabularyAnswer()) return incorrect;
      return `${base} ${disabled}`;
    }

    if (option === this.selectedVocabularyAnswer()) {
      return selected;
    }

    return `${base} ${hover}`;
  }


  onUserInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.userInput.set(target.value);
  }

  clearChat(): void {
    if (confirm(this.t().confirmClearChat)) {
      this.messages.set([]);
      localStorage.removeItem('chatHistory');
      this.initializeChat();
    }
  }

  public renderMessage(text: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(marked.parse(text) as string);
  }

  private handleError(e: unknown, context: 'chat' | 'home' = 'chat') {
    console.error(e);
    const message = e instanceof Error ? e.message : 'An unknown error occurred.';
    const errorMessage = `Failed to get response from AI. ${message}`;
    if (context === 'home') {
        this.homeError.set(errorMessage);
    } else {
        this.error.set(errorMessage);
        this.messages.update(current => current.filter(m => m.text !== ''));
    }
  }
  
  private scrollToBottom(): void {
    try {
      const element = this.chatContainer()!.nativeElement;
      element.scrollTop = element.scrollHeight;
    } catch (err) {
      console.error('Could not scroll to bottom:', err);
    }
  }

  // --- Speech Recognition and Synthesis Methods ---

  private initializeSpeechRecognition(): void {
    if (!this.speechSupported()) {
      console.warn('Speech Recognition is not supported in this browser.');
      return;
    }
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.isRecording.set(true);
    };

    this.recognition.onend = () => {
      this.isRecording.set(false);
    };

    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      this.error.set(`Speech recognition error: ${event.error}`);
    };

    this.recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      this.userInput.set(this.userInput() + finalTranscript);
    };
  }

  toggleRecording(): void {
    if (!this.recognition) return;

    if (this.isRecording()) {
      this.recognition.stop();
    } else {
      this.userInput.set('');
      this.recognition.start();
    }
  }

  speak(textToSpeak: string): void {
    if (this.currentlySpeakingText() === textToSpeak) {
      window.speechSynthesis.cancel();
      this.currentlySpeakingText.set(null);
      return;
    }

    const cleanedText = textToSpeak
      .replace(/<[^>]*>/g, '') 
      .replace(/[*_`#]/g, ''); 

    const utterance = new SpeechSynthesisUtterance(cleanedText);
    utterance.lang = 'en-US';

    utterance.onstart = () => {
      this.currentlySpeakingText.set(textToSpeak);
    };

    utterance.onend = () => {
      this.currentlySpeakingText.set(null);
    };

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event.error);
      this.error.set('Sorry, text-to-speech is not available right now.');
      this.currentlySpeakingText.set(null);
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }
}