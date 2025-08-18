# Gemini API 代理集成 OpenRouter & 魔塔社区 API 设计文档

## 1. 概述

本文档旨在为现有的 Gemini API 代理项目提供一个清晰、可扩展的设计方案，以集成 OpenRouter 和魔塔社区（ModelScope）的 API 转发功能。设计将遵循模块化、可扩展性和代码复用的核心原则。

## 2. 文件结构

为了更好地组织代码并支持未来扩展，我们将引入一个新的 `providers` 目录。

```
src/
├── providers/
│   ├── openai.mjs         # 现有的 OpenAI <-> Gemini 适配器
│   ├── openrouter.mjs     # 新增：OpenRouter 适配器
│   └── modelscope.mjs     # 新增：魔塔社区 适配器
├── handle_request.js      # 核心请求处理器
├── verify_keys.js         # 密钥验证逻辑
└── ...                    # 其他文件
```

**说明:**

*   `src/providers/`：此目录将存放所有与特定 API 服务相关的逻辑，每个文件代表一个 "Provider"。
*   `openai.mjs`：将现有的 [src/openai.mjs](src/openai.mjs) 文件移动到此目录下，以保持结构一致。
*   `openrouter.mjs` & `modelscope.mjs`：将为这两个新服务创建独立的模块文件。

## 3. 路由机制

我们将重构 [src/handle_request.js](src/handle_request.js) 中的路由逻辑，使其更具扩展性。新的路由机制将基于 URL 路径的前缀来动态选择对应的 Provider。

**代码示例 (src/handle_request.js):**

```javascript
import openai from './providers/openai.mjs';
import openrouter from './providers/openrouter.mjs';
import modelscope from './providers/modelscope.mjs';

// 路由表，将路径前缀映射到对应的处理模块
const routes = {
  '/openai': openai,
  '/openrouter': openrouter,
  '/modelscope': modelscope,
};

export async function handleRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 根据路径前缀查找 Provider
  for (const prefix in routes) {
    if (pathname.startsWith(prefix)) {
      // 将请求传递给相应的 Provider，并移除路径前缀
      // 例如：/openrouter/chat/completions -> /chat/completions
      const newRequest = new Request(
        new URL(pathname.substring(prefix.length), request.url),
        request
      );
      return routes[prefix].fetch(newRequest);
    }
  }

  // ... (保留现有的 /verify 和 / 根路径处理逻辑)

  // 默认转发到 Gemini
  return forwardToGemini(request);
}

async function forwardToGemini(request) {
  // ... (现有直接转发到 Gemini 的逻辑)
}
```

**设计说明:**

*   **路由表 (routes)**: 我们创建了一个简单的 JavaScript 对象作为路由表，清晰地定义了路径前缀和处理模块的映射关系。
*   **动态分发**: 通过遍历路由表并使用 `pathname.startsWith()`，我们可以轻松地将请求分发给正确的 Provider。
*   **路径重写**: 在将请求传递给 Provider 之前，我们移除了特定的前缀（如 `/openrouter`），这样每个 Provider 模块内部就可以处理与 OpenAI 兼容的相对路径（如 `/chat/completions`），从而最大化地复用逻辑。

## 4. 配置管理

为了集中管理不同服务的配置（如基础 URL），我们建议在每个 Provider 模块内部定义自己的配置。

**代码示例 (src/providers/openrouter.mjs):**

```javascript
const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const targetUrl = `${OPENROUTER_API_BASE}${url.pathname}${url.search}`;

    // ... (请求转发和处理逻辑)
  }
};
```

**代码示例 (src/providers/modelscope.mjs):**

```javascript
const MODELSCOPE_API_BASE = 'https://api.modelscope.cn/v1';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const targetUrl = `${MODELSCOPE_API_BASE}${url.pathname}${url.search}`;

    // ... (请求转发和处理逻辑)
  }
};
```

**设计说明:**

*   **模块内配置**: 将配置（如 `API_BASE`）保留在各自的模块内部，可以保持模块的独立性和封装性。
*   **密钥处理**: OpenRouter 和魔塔社区的 API 密钥通常通过 `Authorization: Bearer YOUR_API_KEY` 的方式传递。我们可以在每个 Provider 的 `fetch` 方法内部，从请求头中提取 `Authorization` 并将其透传给目标 API。这与现有 [openai.mjs](src/openai.mjs) 的处理方式类似。

## 5. 请求/响应转换

由于 OpenRouter 和魔塔社区的 API 在很大程度上与 OpenAI 兼容，我们可以复用 [openai.mjs](src/openai.mjs) 中已有的转换逻辑。然而，为了应对未来可能出现的差异，我们设计一个可扩展的转换模式。

**通用 Provider 模块结构 (src/providers/base_provider.mjs - 概念模型):**

```javascript
// 这是一个概念模型，用于说明通用结构，可以不创建实际文件

export default {
  // 模块配置
  API_BASE: 'https://api.example.com/v1',
  API_KEY_HEADER: 'Authorization', // 或 'x-api-key' 等

  // 主入口函数
  async fetch(request) {
    // 1. 提取和处理 API Key
    const apiKey = this.extractApiKey(request.headers);

    // 2. 转换请求体 (如果需要)
    const originalBody = await request.json();
    const transformedBody = this.transformRequest(originalBody);

    // 3. 构建并发送请求到目标 API
    const response = await fetch(this.buildUrl(request), {
      method: request.method,
      headers: this.buildHeaders(apiKey),
      body: JSON.stringify(transformedBody),
    });

    // 4. 转换响应体 (如果需要)
    const originalResponse = await response.json();
    const transformedResponse = this.transformResponse(originalResponse);

    return new Response(JSON.stringify(transformedResponse), response);
  },

  // --- 可被具体 Provider 覆盖的辅助方法 ---

  extractApiKey(headers) {
    // 默认实现：提取 Bearer Token
    return headers.get('Authorization')?.split(' ')[1];
  },

  buildUrl(request) {
    const url = new URL(request.url);
    return `${this.API_BASE}${url.pathname}${url.search}`;
  },

  buildHeaders(apiKey) {
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set(this.API_KEY_HEADER, `Bearer ${apiKey}`);
    return headers;
  },

  transformRequest(body) {
    // 默认：不转换，直接返回
    return body;
  },

  transformResponse(body) {
    // 默认：不转换，直接返回
    return body;
  }
};
```

**设计说明:**

*   **模板方法模式**: 上述结构类似于一个模板，定义了请求处理的骨架。
*   **默认实现**: 提供了通用的默认实现，对于完全兼容 OpenAI 的服务（如 OpenRouter），可能只需要很少的修改。
*   **按需覆盖**: 对于有特殊需求的服务（如魔塔社区可能需要调整模型名称或参数），只需在自己的模块中覆盖相应的转换方法（`transformRequest`, `transformResponse`）即可。

## 6. 错误处理

我们将采用统一的错误处理策略，在每个 Provider 内部捕获来自上游 API 的错误，并将其转换为 OpenAI 兼容的错误格式返回给客户端。

**代码示例 (src/providers/openrouter.mjs):**

```javascript
// ...

export default {
  async fetch(request) {
    try {
      // ... (请求转发逻辑)
      const response = await fetch(targetUrl, ...);

      if (!response.ok) {
        // 如果上游 API 返回错误，捕获它
        const errorBody = await response.json();
        // 将其转换为 OpenAI 格式的错误响应
        return this.handleUpstreamError(errorBody, response.status);
      }

      // ... (正常响应处理)

    } catch (err) {
      console.error('Error in OpenRouter provider:', err);
      return new Response(JSON.stringify({
        error: {
          message: 'Internal Server Error: ' + err.message,
          type: 'internal_error',
        }
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  },

  handleUpstreamError(errorBody, status) {
    // 将 OpenRouter 的错误格式转换为标准的 OpenAI 错误格式
    const errorMessage = errorBody.error?.message || 'Unknown upstream error';
    const errorType = errorBody.error?.type || 'upstream_api_error';

    return new Response(JSON.stringify({
      error: {
        message: `[OpenRouter] ${errorMessage}`,
        type: errorType,
      }
    }), { status, headers: { 'Content-Type': 'application/json' } });
  }
};
```

**设计说明:**

*   **Provider 内部处理**: 每个 Provider 负责理解并处理其对应上游 API 的特定错误格式。
*   **统一对外格式**: 所有 Provider 都应将捕获的错误转换为统一的、类似 OpenAI 的错误格式，这样客户端就可以用一致的方式处理来自不同服务的错误。
*   **添加来源信息**: 在错误信息中加入来源标识（如 `[OpenRouter]`），有助于调试和问题定位。

## 7. 下一步

基于此设计文档，下一步的开发工作将包括：

1.  创建 `src/providers` 目录，并将 [src/openai.mjs](src/openai.mjs) 移动进去。
2.  在 `src/providers` 中创建 `openrouter.mjs` 和 `modelscope.mjs` 的骨架文件。
3.  重构 [src/handle_request.js](src/handle_request.js) 以实现新的路由机制。
4.  在 `openrouter.mjs` 和 `modelscope.mjs` 中实现完整的 `fetch` 逻辑，包括请求转发、密钥处理和错误处理。
5.  根据需要，为 `modelscope.mjs` 实现特定的请求/响应转换逻辑。

## 统一 Provider 架构重构

为了提高代码的可维护性、可扩展性和一致性，我们对请求处理逻辑进行了一次重要的重构。核心思想是引入一个统一的、基于"Provider"的模块化架构。

### 重构前

在重构之前，项目的请求处理逻辑 (src/handle_request.js) 是一种混合模式：
-   对于 OpenRouter、ModelScope 等特定的 API 服务，请求会通过路径前缀被路由到各自独立的处理模块中。
-   对于 Google Gemini API，其处理逻辑则作为默认选项直接内嵌在 src/handle_request.js 的主干流程中。

这种设计导致了结构上的不一致，使得添加新的 API Provider 或者修改 Gemini 的特定逻辑变得复杂和混乱。

### 重构后

重构后的架构遵循以下原则：

1.  **一切皆 Provider**：我们将每一个下游的 AI API 服务（如 Gemini, OpenRouter, OpenAI 等）都抽象为一个独立的 **Provider** 模块。
2.  **标准化接口**：每个 Provider 模块都存放在 `src/providers/` 目录下，并对外暴露一个统一的 `handle(request, env)` 方法。
3.  **路由驱动**：主请求处理文件 src/handle_request.js 的职责被简化为一个纯粹的"路由器"。它根据请求 URL 的路径前缀（例如 `/gemini`, `/openrouter`）来决定将请求分发给哪一个具体的 Provider 模块进行处理。
4.  **明确的默认行为**：如果请求的路径没有任何匹配的 Provider，系统将返回一个标准的 `404 Not Found` 错误，而不是像以前那样默认流向 Gemini 的处理逻辑。

通过这次重构，原有的 Gemini 处理逻辑被从 src/handle_request.js 中完全剥离，并封装进了新的 src/providers/gemini.mjs 模块中，与其他 Provider 拥有了同等的地位。

这使得整个代码库的结构更加清晰，未来集成新的 API 服务将变得异常简单——只需在 `providers` 目录下新增一个遵循标准接口的文件，并在主路由器中注册其路径即可。