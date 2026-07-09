import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for base64 images
  app.use(express.json({ limit: '50mb' }));

  // Helper function with retry and model fallback
  async function generateWithRetryAndFallback(options: any, maxRetries = 1) {
    const models = ['gemini-3.5-flash', 'gemini-3.1-flash-lite'];
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      for (const model of models) {
        try {
          return await ai.models.generateContent({ ...options, model });
        } catch (error: any) {
          console.warn(`Attempt ${attempt + 1} with ${model} failed:`, error?.message || error);
          const isRateLimit = error?.status === 429 || error?.message?.includes('429');
          const isNotFound = error?.status === 404 || error?.message?.includes('404');
          if (isRateLimit || isNotFound) {
            continue; // Immediately try the next model without waiting
          }
          const is503 = error?.status === 'UNAVAILABLE' || error?.status === 503 || error?.message?.includes('503') || error?.message?.includes('high demand');
          if (!is503 && model === models[models.length - 1] && attempt === maxRetries) {
            throw error;
          }
        }
      }
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    throw new Error('All models failed. Please try again.');
  }

  // API Routes
  app.post('/api/extract', async (req, res) => {
    try {
      const { image, mode } = req.body;
      
      if (!image) {
        return res.status(400).json({ error: 'Image is required' });
      }

      // Remove data URL prefix if present
      const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

      const imagePart = {
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Data,
        },
      };

      if (mode === 'details') {
        const response = await generateWithRetryAndFallback({
          contents: {
            parts: [
              imagePart,
              { text: 'Analyze this image of a medicine box. Extract the medicine name and concentration/dosage. The text might be in Arabic or English. Return a JSON object with properties "name" and "concentration". If you cannot find them, return empty strings.' }
            ]
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: 'The name of the medicine.' },
                concentration: { type: Type.STRING, description: 'The concentration or dosage of the medicine, e.g., 500mg' }
              },
              required: ['name', 'concentration']
            }
          }
        });

        const data = JSON.parse(response.text || '{}');
        res.json(data);
      } else if (mode === 'expiry') {
        const response = await generateWithRetryAndFallback({
          contents: {
            parts: [
              imagePart,
              { text: 'Analyze this image of a medicine box or blister pack. Find the expiration date (EXP). Return a JSON object with a property "date" formatted as YYYY-MM-DD. Set the day (DD) to the last valid day of that month (e.g., if it expires in 10/2025, return 2025-10-31). If you cannot find a clear expiration date, return an empty string.' }
            ]
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING, description: 'The expiration date in YYYY-MM-DD format.' }
              },
              required: ['date']
            }
          }
        });

        const data = JSON.parse(response.text || '{}');
        res.json(data);
      } else {
        res.status(400).json({ error: 'Invalid mode' });
      }

    } catch (error) {
      console.error('Extraction error:', error);
      res.status(500).json({ error: 'Failed to extract data' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
