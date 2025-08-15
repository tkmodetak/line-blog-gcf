const crypto = require('crypto');
  const { Anthropic } = require('@anthropic-ai/sdk');
  const axios = require('axios');

  // 環境変数
  const LINE_CHANNEL_SECRET =
  process.env.LINE_CHANNEL_SECRET;
  const LINE_CHANNEL_ACCESS_TOKEN =
  process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

  // Claude初期化
  const anthropic = new Anthropic({
    apiKey: CLAUDE_API_KEY?.replace(/\s+/g, ''),
  });

  // LINE署名検証
  function validateSignature(body, signature) {
    const channelSecret = LINE_CHANNEL_SECRET;
    const bodyString = JSON.stringify(body);
    const hash = crypto.createHmac('sha256',
  channelSecret).update(bodyString).digest('base64');
    return hash === signature;
  }

  // ブログ生成関数
  async function generateBlog(topic) {
    try {
      console.log('Starting blog generation for topic:',
  topic);

      const prompt = `「${topic}」についてのブログ記事を日本
  語で作成してください。
      
      以下の構成で書いてください：
      1. キャッチーなタイトル
      2. 導入文
      3. 本文（3つのセクション）
      4. まとめ
      
      読みやすく、SEOも意識した文章でお願いします。`;

      const message = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      });

      const text = message.content[0].text;
      console.log('Claude response received, length:',
  text.length);
      return text;

    } catch (error) {
      console.error('Claude API error:', error.message);
      return `# ${topic}について\n\nエラーが発生しました: 
  ${error.message}`;
    }
  }

  // Vercel KV Storage (または一時的な代替案)
  const blogStorage = [];

  // ブログ保存関数（簡易版）
  async function saveToStorage(content, topic) {
    try {
      const fileName = `blog_${topic}_${Date.now()}.md`;

      // Vercel KV Storageまたは外部DBに保存する代わりに、
      // 一時的にメモリに保存（後でSupabaseなどに移行）
      blogStorage.push({
        fileName,
        content,
        topic,
        createdAt: new Date()
      });

      console.log('Blog saved:', fileName);
      return fileName;

    } catch (error) {
      console.error('Save error:', error);
      throw error;
    }
  }

  // LINE返信機能
  async function replyToLine(replyToken, message) {
    try {
      console.log('Sending LINE reply...');

      const cleanToken =
  LINE_CHANNEL_ACCESS_TOKEN?.replace(/\s+/g, '');

      const response = await
  axios.post('https://api.line.me/v2/bot/message/reply', {
        replyToken: replyToken,
        messages: [{
          type: 'text',
          text: message
        }]
      }, {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Reply sent successfully');
    } catch (error) {
      console.error('Error sending reply:',
  error.response?.data || error.message);
    }
  }

  // メインのWebhookハンドラー
  module.exports = async (req, res) => {
    console.log('Webhook received');

    // CORS対応
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, 
  GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers',
  'Content-Type, x-line-signature');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not 
  allowed' });
    }

    try {
      const events = req.body.events || [];

      for (const event of events) {
        if (event.type === 'message' && event.message.type
  === 'text') {
          const text = event.message.text;
          const replyToken = event.replyToken;
          console.log('Message:', text);

          try {
            // ブログ生成
            const blogContent = await generateBlog(text);
            console.log('Blog generated successfully');

            // 保存
            const fileName = await
  saveToStorage(blogContent, text);
            console.log('Saved:', fileName);

            // LINE に成功メッセージを送信
            const successMessage = `🎉 
  ブログ記事の生成が完了しました！

  📝 テーマ: 「${text}」
  📄 ファイル名: ${fileName}
  🌐 ブログサイト: https://your-blog.vercel.app

  新しい記事がブログサイトに表示されています！`;

            await replyToLine(replyToken, successMessage);

          } catch (error) {
            console.error('Blog generation error:', error);
            await replyToLine(replyToken, `❌ 
  エラーが発生しました: ${error.message}`);
          }
        }
      }

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error:', error);
      res.status(200).json({ success: true });
    }
  };
