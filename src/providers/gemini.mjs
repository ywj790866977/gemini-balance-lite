// src/providers/gemini.mjs

import openai from './openai.mjs';
import {handleVerification} from "../verify_keys.js";

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com';

async function handle(request, env) {

  const url = new URL(request.url);
  const {pathname, search} = url;

  // 判断是否为 OpenAI API 特征路径
  if (pathname.endsWith('/chat/completions') || pathname.endsWith('/embeddings') || pathname.endsWith('/models')) {
    // 创建一个新的 Request 对象，移除 /gemini 前缀
    const newPathname = pathname.replace('/gemini', '');
    const newUrl = new URL(newPathname + search, url.origin);
    const newRequest = new Request(newUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      duplex: 'half' // for nodejs >= 18
    });

    // 交给 openai 模块处理
    console.log('[Gemini] Proxy request', newRequest)
    return await openai.fetch(newRequest);
  } else if (pathname === '/verify' && request.method === 'POST') {
    return handleVerification(request);
  } else {
    // 执行现有的代理逻辑
    // 从路径中移除 provider 前缀 /gemini，以构建正确的上游 URL
    const targetUrl = `${GEMINI_API_BASE_URL}${pathname.replace('/gemini', '')}${search}`;

    const headers = new Headers(request.headers);
    headers.delete('host');

    // 处理 API Key 负载均衡
    const apiKeyHeader = 'x-goog-api-key';
    const apiKey = headers.get(apiKeyHeader);
    if (apiKey) {
      const apiKeys = apiKey.split(',').map(k => k.trim()).filter(k => k);
      if (apiKeys.length > 0) {
        const selectedKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
        headers.set(apiKeyHeader, selectedKey);
      }
    }

    try {
      // 添加请求日志
      console.log('[Gemini] Proxying request:', {
        method: request.method,
        url: targetUrl,
        headers: Object.fromEntries(headers.entries()),
      });

      const response = await fetch(targetUrl, {
        method: request.method,
        headers: headers,
        body: request.body,
      });

      const responseHeaders = new Headers(response.headers);
      responseHeaders.delete('transfer-encoding');
      responseHeaders.delete('connection');
      responseHeaders.delete('keep-alive');
      responseHeaders.delete('content-encoding');
      responseHeaders.set('Referrer-Policy', 'no-referrer');

      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders,
      });
    } catch (e) {
      console.error('Error fetching from Gemini:', e);
      return new Response(JSON.stringify({error: 'Proxy request to Gemini failed'}), {
        status: 500,
        headers: {'Content-Type': 'application/json'},
      });
    }
  }
}

export default {handle};