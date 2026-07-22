using System;
using System.Net;

namespace PkmnClient
{
    public class PkmnException : Exception
    {
        public HttpStatusCode StatusCode { get; }
        public string? ResponseBody { get; }
        public string? ApiError { get; }

        public PkmnException(string message, HttpStatusCode statusCode, string? responseBody, string? apiError)
            : base(message)
        {
            StatusCode = statusCode;
            ResponseBody = responseBody;
            ApiError = apiError;
        }

        public override string ToString()
        {
            var details = !string.IsNullOrEmpty(ApiError) ? $" | API Error: {ApiError}" : "";
            return $"{base.ToString()} (HTTP {(int)StatusCode} {StatusCode}{details})";
        }
    }
}
