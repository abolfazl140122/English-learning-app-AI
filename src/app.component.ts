/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  signal,
} from '@angular/core';
import {GoogleGenAI} from '@google/genai';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'class': 'flex items-center justify-center min-h-screen p-4',
  },
})
export class AppComponent implements OnInit {
  greeting = signal<string | null>(null);
  isLoading = signal<boolean>(true);
  error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    if (!process.env.API_KEY) {
      this.error.set(
        'API key is not configured. Please set the API_KEY environment variable.',
      );
      this.isLoading.set(false);
      return;
    }

    try {
      const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents:
          'Generate a single, short, friendly, and welcoming greeting for a user visiting a new website for the first time. Keep it concise and uplifting.',
      });

      this.greeting.set(response.text);
    } catch (e) {
      console.error(e);
      this.error.set(
        'Failed to fetch a greeting from the Gemini API. Please check the console for more details.',
      );
    } finally {
      this.isLoading.set(false);
    }
  }
}
