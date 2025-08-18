// OpenRouter API Provider
const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';


async function handle(request, env) {
  try {
    // 构建目标 URL
    const url = new URL(request.url);
    const {pathname, search} = url;

    // 移除路由前缀
    const apiPath = pathname.replace('/openrouter', '');
    
    // 构建目标 URL，避免路径重复
    let targetUrl;
    if (apiPath.startsWith('/api/v1')) {
      // 如果路径已包含 /api/v1，则直接使用基础 URL 和路径
      targetUrl = new URL(apiPath + search, OPENROUTER_API_BASE).href;
    } else {
      // 否则正常拼接
      targetUrl = `${OPENROUTER_API_BASE}${apiPath}${search}`;
    }
    // 处理请求头
    const headers = new Headers();

    // 提取并设置 Authorization 头
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
      headers.set('Authorization', authHeader);
    }

    // 复制其他相关头信息
    const contentType = request.headers.get('Content-Type');
    if (contentType) {
      headers.set('Content-Type', contentType);
    }

    // 添加请求日志
    console.log('[OpenRouter] Proxying request:', {
      method: request.method,
      url: targetUrl,
      headers: Object.fromEntries(headers.entries()),
    });
    // 转发请求
    const response = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: headers,
      body: request.body,
      // 保持流式传输
      duplex: 'half'
    });

    // 检查响应是否成功
    if (!response.ok) {
      return handleUpstreamError(response);
    }

    // 返回响应
    return response;
  } catch (error) {
    // 错误处理
    console.error('[OpenRouter] Error forwarding request:', error);

    // 构造错误响应
    const errorResponse = {
      error: {
        message: `[OpenRouter] ${error.message || 'Unknown error occurred'}`,
        type: 'openrouter_error',
        param: null,
        code: 'openrouter_error'
      }
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: {'Content-Type': 'application/json'}
    });
  }
}

async function handleUpstreamError(response) {
  try {
    const errorData = await response.json();
    return new Response(JSON.stringify({
      error: {
        message: `[OpenRouter] ${errorData.error?.message || 'Upstream API error'}`,
        type: errorData.error?.type || 'upstream_error',
        param: errorData.error?.param || null,
        code: errorData.error?.code || 'upstream_error'
      }
    }), {
      status: response.status,
      headers: {'Content-Type': 'application/json'}
    });
  } catch (parseError) {
    // 如果无法解析 JSON，返回一个通用错误
    return new Response(JSON.stringify({
      error: {
        message: `[OpenRouter] Upstream API error (status: ${response.status})`,
        type: 'upstream_error',
        param: null,
        code: 'upstream_error'
      }
    }), {
      status: response.status,
      headers: {'Content-Type': 'application/json'}
    });
  }
}

export default {handle};