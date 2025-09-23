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

const translations = {
  en: {
    welcome: 'Welcome!',
    whatToCallYou: 'What should we call you?',
    enterYourName: 'Enter your name',
    letsStart: "Let's Start",
    aiAssistant: 'AI Assistant',
    online: 'Online',
    typeYourMessage: 'Type your message...',
    clearChat: 'Clear Chat',
    confirmClearChat: 'Are you sure you want to clear the entire conversation?',
    connecting: 'Connecting to AI...',
    toggleThemeLight: 'Switch to Light Theme',
    toggleThemeDark: 'Switch to Dark Theme',
    home: 'Home',
    chat: 'Chat',
    backToHome: 'Back to Home',
    dailyTips: "Daily Tips",
    todaysChallenge: "Today's Challenge",
    welcomeBack: "Welcome back",
    learnSomethingNew: "Let's learn something new today.",
    startChallenge: 'Start Challenge',
    quickActions: 'Quick Actions',
    practiceConversation: 'Practice Conversation',
    vocabularyQuiz: 'Vocabulary Quiz',
    comingSoon: 'Coming Soon',
  },
  fa: {
    welcome: 'خوش آمدید!',
    whatToCallYou: 'شما را چه بنامیم؟',
    enterYourName: 'نام خود را وارد کنید',
    letsStart: 'شروع کنیم',
    aiAssistant: 'دستیار هوش مصنوعی',
    online: 'آنلاین',
    typeYourMessage: 'پیام خود را تایپ کنید...',
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
    welcomeBack: "خوش برگشتی",
    learnSomethingNew: "بیا امروز یه چیز جدید یاد بگیریم.",
    startChallenge: 'شروع چالش',
    quickActions: 'دسترسی سریع',
    practiceConversation: 'تمرین مکالمه',
    vocabularyQuiz: 'آزمون واژگان',
    comingSoon: 'به زودی',
  },
};

type Theme = 'light' | 'dark';
type AppState = 'loading' | 'languageSelection' | 'onboarding' | 'home' | 'chatting';

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

  t = computed(() => translations[this.uiLanguage()]);

  private chat!: Chat;
  private ai!: GoogleGenAI;
  private sanitizer = inject(DomSanitizer);

  constructor() {
    this.initializeTheme();

    setTimeout(() => {
      const storedName = localStorage.getItem('userName');
      const storedLang = localStorage.getItem('uiLanguage');

      if (storedName && (storedLang === 'en' || storedLang === 'fa')) {
        this.userName.set(storedName);
        this.uiLanguage.set(storedLang);
        this.appState.set('home');
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

    const systemInstruction = `You are a highly advanced and eloquent AI companion. The user, named ${this.userName()}, is communicating with you. Your primary directive is to engage in thoughtful and enriching conversations, conducted exclusively in Persian (Farsi).
    Core Persona:
    - **Knowledgeable & Eloquent:** Use a rich and diverse vocabulary. Your responses should be well-structured, clear, and demonstrate a deep understanding of the topic.
    - **Supportive & Patient:** Be encouraging and create a positive conversational environment. Never be judgmental.
    - **Naturally Inquisitive:** Ask open-ended, thought-provoking questions to encourage deeper conversation and help the user explore their thoughts.
    - **Emotionally Intelligent:** Use emojis tastefully to convey warmth and personality, making the interaction feel more human and less robotic.
    Communication Rules:
    - **Language:** You MUST ALWAYS respond in Persian (Farsi), no matter the input language.
    - **Greeting:** Begin your very first message by warmly greeting the user by their name, ${this.userName()}.
    - **Formatting:** Use Markdown for formatting (like bolding key terms or using lists) to improve readability.
    - **Clarity:** Avoid technical jargon unless it's relevant and explained. The goal is clear, beautiful communication.`;
      
    this.chat = this.ai.chats.create({
      model: 'gemini-2.5-flash',
      config: { systemInstruction },
    });
    
    const storedHistory = localStorage.getItem('chatHistory');
    if (storedHistory && JSON.parse(storedHistory).length > 0) {
      this.messages.set(JSON.parse(storedHistory));
    } else {
      // Don't send a message immediately, wait for user interaction in chat.
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
      this.appState.set('home');
    }
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

        const prompt = `You are an AI assistant for an English learning app. The user's name is ${this.userName()} and their selected language is ${requestedLang}. Your task is to generate motivational and engaging content for the app's home screen, IN ${requestedLang}.
Provide the following in a JSON object:
1. 'tips': An array of 3 'Daily Tips' for learning English. Each tip should have a 'title' and a 'description'. These tips should be concise and encouraging.
2. 'challenge': A "Today's Challenge", which is a short paragraph presenting a simple, actionable task for the user to practice their English today.

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
    
    if (this.messages().length === 0) {
      // This is the first message from the user in a new chat. Let's get the AI's greeting.
      this.isLoading.set(true);
      const initialResult = await this.chat.sendMessageStream({ message: `Hello! Please introduce yourself.` });
      this.messages.update(current => [...current, { role: 'model', text: '' }]);
      let initialText = '';
      for await (const chunk of initialResult) {
        initialText += chunk.text;
        this.messages.update(current => {
          const lastMessage = current[current.length - 1];
          lastMessage.text = initialText;
          return [...current];
        });
      }
      this.isLoading.set(false);
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

  onUserInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.userInput.set(target.value);
  }

  clearChat(): void {
    if (confirm(this.t().confirmClearChat)) {
      this.messages.set([]);
      localStorage.removeItem('chatHistory');
      // FIX: The 'config' property of a Chat object is private.
      // Re-initializing the chat is the correct way to clear the conversation history.
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
}