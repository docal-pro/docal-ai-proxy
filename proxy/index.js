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
        throw new Error("Invalid URL format. Expected /{type}/{path}");
      }

      const serverUrl = `${env.SERVER_URL}:${
        type === "twitter" ? env.SERVER_PORT_TWITTER : env.SERVER_PORT_DISCOURSE
      }/${path}`;

      console.log("ℹ️  Attempting to forward to:", serverUrl); // Debug log

      const headers = new Headers({
        "Content-Type": "application/json",
      });

      const fetchOptions = {
        method: request.method,
        headers: headers,
      };

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
      console.log(
        "ℹ️  Server response:\n",
        JSON.parse(responseText.replace(/\\n/g, "\\n ")).result
      ); // Pretty print debug log

      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        responseData = responseText;
      }

      // Forward the actual server status code and response
      const corsHeaders = getCorsHeaders(request);
      const modifiedHeaders = new Headers({
        "Content-Type": "application/json",
        ...corsHeaders,
      });

      return new Response(
        typeof responseData === "string"
          ? responseData
          : JSON.stringify(responseData, null, 2), // Pretty print response
        {
          status: response.status,
          headers: modifiedHeaders,
        }
      );
    } catch (err) {
      console.error("❌ Proxy error:", err.message, err.stack); // Debug log
      return new Response(
        JSON.stringify({
          error: err.message,
          stack: err.stack,
          message: "Proxy server error",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(request),
          },
        }
      );
    }
  },
};
