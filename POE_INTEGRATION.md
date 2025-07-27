# Poe.com Integration for SillyTavern

This integration allows SillyTavern to use Poe.com's API for AI chat completions. Poe.com provides access to various AI models including Claude, GPT-4, and others.

## Features

- **Multiple Bot Support**: Use different Poe.com bots (Claude-3-5-Sonnet, Claude-3-Opus, GPT-4, etc.)
- **Streaming Support**: Real-time streaming responses
- **Customizable Parameters**: Temperature, system prompt skipping, and more
- **Conversation Management**: Optional user ID, conversation ID, and message ID management
- **API Key Management**: Secure storage of Poe.com API keys

## Setup

### 1. Get a Poe.com API Key

1. Visit [Poe.com](https://poe.com)
2. Create an account or log in
3. Go to your account settings
4. Generate an API key

### 2. Configure in SillyTavern

1. Start SillyTavern
2. Go to the AI Response Configuration panel
3. Select "Poe.com" from the API dropdown
4. Enter your Poe.com API key in the secrets management
5. Configure your preferred bot and settings

### 3. API Key Management

To add your Poe.com API key:

1. Go to Settings → Secrets Management
2. Add a new secret with key `api_key_poe`
3. Enter your Poe.com API key as the value
4. Save the secret

## Configuration Options

### Bot Name
- **Default**: `claude-3-5-sonnet`
- **Available Options**: 
  - `claude-3-5-sonnet` (Claude 3.5 Sonnet)
  - `claude-3-opus` (Claude 3 Opus)
  - `gpt-4` (GPT-4)
  - `gpt-4-turbo` (GPT-4 Turbo)
  - `gemini-pro` (Google Gemini Pro)
  - And many more available on Poe.com

### Temperature
- **Range**: 0.0 to 2.0
- **Default**: 0.7
- Controls the randomness of responses

### Skip System Prompt
- **Default**: false
- When enabled, skips the system prompt in the request

### Stream Response
- **Default**: true
- When enabled, responses are streamed in real-time

### Optional IDs
- **User ID**: Custom user identifier (auto-generated if empty)
- **Conversation ID**: Custom conversation identifier (auto-generated if empty)
- **Message ID**: Custom message identifier (auto-generated if empty)

## Usage

1. Select "Poe.com" as your main API in the AI Response Configuration
2. Choose your preferred bot from the dropdown
3. Adjust temperature and other settings as needed
4. Test the connection using the "Test Connection" button
5. Start chatting with your characters using Poe.com's AI models

## Technical Details

### Backend Integration
- **File**: `src/endpoints/backends/poe.js`
- **Endpoint**: `/api/backends/poe/generate`
- **Status Endpoint**: `/api/backends/poe/status`

### Frontend Integration
- **File**: `public/scripts/poe.js`
- **CSS**: `public/css/poe-settings.css`

### API Compatibility
The integration converts SillyTavern's message format to Poe.com's protocol format and converts Poe.com's responses back to OpenAI-compatible format for seamless integration.

## Troubleshooting

### Common Issues

1. **"Poe.com API Key not set"**
   - Make sure you've added your API key in the secrets management
   - Verify the key is correct and active

2. **"Connection failed"**
   - Check your internet connection
   - Verify the bot name is correct
   - Ensure your API key has the necessary permissions

3. **"Streaming error"**
   - Try disabling streaming in the settings
   - Check if your Poe.com account has streaming enabled

### Getting Help

If you encounter issues:
1. Check the browser console for error messages
2. Verify your Poe.com API key is valid
3. Test with a simple bot like `claude-3-5-sonnet`
4. Check the SillyTavern logs for backend errors

## Limitations

- Poe.com has rate limits that may affect usage
- Some bots may have specific requirements or limitations
- API availability depends on Poe.com's service status

## Contributing

To contribute to this integration:
1. Fork the repository
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## License

This integration follows the same license as SillyTavern. 