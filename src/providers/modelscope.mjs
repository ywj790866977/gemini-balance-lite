// ModelScope API Provider
const MODELSCOPE_API_BASE = 'https://api-inference.modelscope.cn';

async function handle(request, env) {

  try {
    // 构建目标 URL
    const url = new URL(request.url);
    const {pathname, search} = url;
    
    // 智能处理路径：确保转发的路径包含 /v1
    let apiPath = pathname.replace('/modelscope', '');
    if (!apiPath.startsWith('/v1')) {
      apiPath = '/v1' + apiPath;
    }
    
    const targetUrl = `${MODELSCOPE_API_BASE}${apiPath}${search}`;

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

    // 获取请求体并进行转换
    let requestBody = request.body;
    if (requestBody) {
      // 注意：这里需要根据实际的请求体类型进行处理
      // 如果是 JSON，可能需要先解析再转换
      requestBody = transformRequest(requestBody);
    }

    console.log('[ModelScope] Proxying request:', {
      method: request.method,
      url: targetUrl,
      headers: Object.fromEntries(headers.entries()),
    });

    // 转发请求
    const response = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: headers,
      body: requestBody,
      // 保持流式传输
      duplex: 'half'
    });

    // 检查响应是否成功
    if (!response.ok) {
      console.error("[ModelScope] Error source", response);
      return handleUpstreamError(response);
    }

    // 直接返回响应，不修改响应体
    // 如果需要处理响应体，需要先读取再转换
    return transformResponse(response);
  } catch (error) {
    // 错误处理
    console.error('[ModelScope] Error forwarding request:', error);

    // 构造错误响应
    const errorResponse = {
      error: {
        message: `[ModelScope] ${error.message || 'Unknown error occurred'}`,
        type: 'modelScope_error',
        param: null,
        code: 'modelScope_error'
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
        message: `[ModelScope] ${errorData.error?.message || 'Upstream API error'}`,
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
        message: `[ModelScope] Upstream API error (status: ${response.status})`,
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

function transformRequest(body) {
  // 未来扩展点：处理请求体转换
  return body;
}

function transformResponse(body) {
  // 未来扩展点：处理响应体转换
  return body;
}

export default {
  handle
};