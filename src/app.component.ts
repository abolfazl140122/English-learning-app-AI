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
import { GoogleGenAI, Chat } from '@google/genai';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';

interface Message {
  role: 'user' | 'model';
  text: string;
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
  },
};

type Theme = 'light' | 'dark';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': `appState() === 'chatting'
      ? 'flex justify-center h-screen w-full'
      : 'flex items-center justify-center h-screen p-4'`,
  },
})
export class AppComponent {
  appState = signal<'loading' | 'languageSelection' | 'onboarding' | 'chatting'>('loading');
  uiLanguage = signal<'en' | 'fa'>('en');
  theme = signal<Theme>('dark');
  userName = signal<string>('');
  messages = signal<Message[]>([]);
  userInput = signal<string>('');
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);
  chatContainer = viewChild<ElementRef>('chatContainer');
  
  t = computed(() => translations[this.uiLanguage()]);

  private chat!: Chat;
  private ai!: GoogleGenAI;
  private sanitizer = inject(DomSanitizer);

  constructor() {
    this.initializeTheme();

    // Show loading screen for a bit for aesthetic purposes
    setTimeout(() => {
      const storedName = localStorage.getItem('userName');
      const storedLang = localStorage.getItem('uiLanguage');

      if (storedName && (storedLang === 'en' || storedLang === 'fa')) {
        this.userName.set(storedName);
        this.uiLanguage.set(storedLang);
        this.appState.set('chatting');
      } else {
        this.appState.set('languageSelection');
      }
    }, 2500);

    // Effect to scroll down chat when new messages are added
    effect(() => {
      if (this.messages().length && this.chatContainer()) {
        this.scrollToBottom();
      }
    });

    // Effect to initialize chat when the state becomes 'chatting'
    effect(() => {
      if (this.appState() === 'chatting' && !this.chat) {
        this.initializeChat();
      }
    });
    
    // Effect to save chat history to localStorage
    effect(() => {
      if (this.messages().length > 0) {
        localStorage.setItem('chatHistory', JSON.stringify(this.messages()));
      }
    });
    
    // Effect to apply theme class to document
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

  async initializeChat(): Promise<void> {
    this.isLoading.set(true);
    if (!process.env.API_KEY) {
      this.error.set('API key not configured. Please set API_KEY.');
      this.isLoading.set(false);
      return;
    }

    this.ai = new GoogleGenAI({apiKey: process.env.API_KEY});

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
      this.isLoading.set(false);
    } else {
      this.startInitialConversation();
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
      this.appState.set('chatting');
    }
  }

  async startInitialConversation() {
    this.isLoading.set(true);
    try {
      // The initial message is now simpler; the system prompt handles the introduction.
      const result = await this.chat.sendMessageStream({
        message: `Hello! Please introduce yourself.`,
      });

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

  onUserInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.userInput.set(target.value);
  }

  clearChat(): void {
    if (confirm(this.t().confirmClearChat)) {
      this.messages.set([]);
      localStorage.removeItem('chatHistory');
      // Re-initialize the chat to get a fresh session.
      this.initializeChat();
    }
  }

  public renderMessage(text: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(marked.parse(text) as string);
  }

  private handleError(e: unknown) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'An unknown error occurred.';
    this.error.set(`Failed to get response from AI. ${message}`);
    // remove the empty model message placeholder on error
    this.messages.update(current => current.filter(m => m.text !== ''));
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