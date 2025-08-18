// src/handle_request.js

import openrouter from './providers/openrouter.mjs';
import modelscope from './providers/modelscope.mjs';
import gemini from './providers/gemini.mjs'; // <-- 导入新的 provider

// 定义路由规则
const routes = {
  '/openrouter': openrouter,
  '/modelscope': modelscope,
  '/gemini': gemini, // <-- 添加 gemini 路由
};

async function handleRequest(request, env) {
  const {pathname} = new URL(request.url);

  // 添加接收请求的日志
  console.log('[handleRequest] Received request:', {
    url: request.url,
    method: request.method,
    pathname: pathname,
    headers: Object.fromEntries(request.headers.entries()),
  });

  // 根据路径前缀查找对应的 provider
  for (const prefix in routes) {
    if (pathname.startsWith(prefix)) {
      const provider = routes[prefix];
      return await provider.handle(request, env);
    }
  }

  // 如果没有匹配的路由，返回 404
  return new Response(JSON.stringify({error: 'Route not found'}), {
    status: 404,
    headers: {'Content-Type': 'application/json'},
  });
}

export {handleRequest};
