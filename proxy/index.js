export default {
  async fetch(request, env) {
    // Define the list of allowed origins
    const allowedOrigins = [
      "https://ai.docal.pro", // Production domain
      "http://localhost:3000", // Local Development
    ];

    // Function to check if the origin is allowed
    function isOriginAllowed(origin) {
      return allowedOrigins.includes(origin);
    }

    // Function to handle CORS headers
    function getCorsHeaders(request) {
      const origin = request.headers.get("Origin");
      const headers = {
        "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      };
      if (isOriginAllowed(origin)) {
        headers["Access-Control-Allow-Origin"] = origin;
      }
      return headers;
    }

    // Handle preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: getCorsHeaders(request),
      });
    }

    try {
      const url = new URL(request.url);
      const type = url.pathname.split("/")[1]; // Extract type name
      const path = url.pathname.split("/")[2]; // Extract method name

      // Add validation
      if (!type || !path) {
        throw new Error("❌ Invalid URL format. Expected /{type}/{path}");
      }

      const serverUrl = `${env.SERVER_URL}:${type === "twitter" ? env.SERVER_PORT_TWITTER : env.SERVER_PORT_DISCOURSE
        }/${path}`;

      console.log("ℹ️  Attempting to forward to:", serverUrl); // Debug log

      const headers = new Headers({
        "Content-Type": "application/json",
      });

      const fetchOptions = {
        method: request.method,
        headers: headers,
      };

      // Handle GET request body, if requested with a query
      const query = url.pathname.split("/")[3]; // Extract query parameter
      if (request.method === "GET" && query) {
        fetchOptions.body = JSON.stringify({ query });
      }

      // Handle POST request body
      if (request.method === "POST") {
        try {
          const body = await request.json();
          console.log("ℹ️  Request body:", body); // Debug log
          fetchOptions.body = JSON.stringify(body);
        } catch (error) {
          throw new Error(`❌ Failed to parse request body: ${error.message}`);
        }
      }

      console.log("ℹ️  Fetch options:", fetchOptions); // Debug log

      const response = await fetch(serverUrl, fetchOptions);
      console.log("ℹ️  Server response status:", response.status); // Debug log

      let responseData;
      const responseText = await response.text();

      // Try to parse as JSON, but handle non-JSON responses gracefully
      try {
        responseData = JSON.parse(responseText);
        console.log(
          "ℹ️  Server response:\n",
          responseData.result
            ? responseData.result.replace(/\\n/g, "\n ")
            : responseData
        );
      } catch (e) {
        // Handle non-JSON response
        console.error("❌ Bad response received:", responseText);
        responseData = {
          error: "Invalid server response",
          details: responseText,
          status: response.status,
        };
      }

      // Forward the actual server status code and response
      const corsHeaders = getCorsHeaders(request);
      const modifiedHeaders = new Headers({
        "Content-Type": "application/json",
        ...corsHeaders,
      });

      return new Response(JSON.stringify(responseData, null, 2), {
        // If we got an error response, use 502 Bad Gateway
        status: response.ok ? response.status : 502,
        headers: modifiedHeaders,
      });
    } catch (err) {
      console.error("❌ Proxy error:", err.message); // Debug log

      // Check for specific connection errors
      const errorMessage = err.message.includes("error code: 1003")
        ? "Unable to connect to server. Please ensure the server is accessible from Cloudflare Workers."
        : err.message;

      return new Response(
        JSON.stringify(
          {
            error: errorMessage,
            details: err.stack,
            message: "Proxy server error",
          },
          null,
          2
        ),
        {
          status: 502, // Use 502 Bad Gateway for connection issues
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(request),
          },
        }
      );
    }
  },
};
