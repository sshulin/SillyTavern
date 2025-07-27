import fetch from 'node-fetch';
import { Router } from 'express';
import { uuidv4 } from '../../util.js';

import { readSecret, SECRET_KEYS } from '../secrets.js';

export const router = Router();

const API_POE = 'https://api.poe.com/bot/';

/**
 * Converts SillyTavern messages to Poe.com protocol messages
 * @param {Array} messages - Array of SillyTavern messages
 * @returns {Array} Array of Poe.com protocol messages
 */
function convertMessagesToPoe(messages) {
    return messages.map(msg => {
        if (msg.role === 'system') {
            return {
                role: 'system',
                content: msg.content
            };
        } else if (msg.role === 'user') {
            return {
                role: 'user',
                content: msg.content
            };
        } else if (msg.role === 'assistant') {
            return {
                role: 'bot',  // Poe protocol uses 'bot' instead of 'assistant'
                content: msg.content
            };
        }
        return null;
    }).filter(Boolean);
}

/**
 * Creates a Poe.com query request
 * @param {Object} request - Express request object
 * @param {Array} messages - Array of Poe.com protocol messages
 * @returns {Object} Poe.com query request object
 */
function createPoeRequest(request, messages) {
    return {
        version: "1.0",  // Use the correct protocol version
        type: "query",
        query: messages,  // This is correct - it should be "query"
        user_id: request.body.user_id || "",
        conversation_id: request.body.conversation_id || "",
        message_id: request.body.message_id || "",
        api_key: request.body.api_key || '',
        access_key: request.body.access_key || '<missing>',
        temperature: request.body.temperature || 0.7,
        skip_system_prompt: request.body.skip_system_prompt || false,
        logit_bias: request.body.logit_bias || {},
        stop_sequences: request.body.stop || [],
        language_code: request.body.language_code || 'en',
        bot_query_id: request.body.bot_query_id || '',
    };
}

/**
 * Handles streaming response from Poe.com
 * @param {import('node-fetch').Response} fetchResponse - Fetch response from Poe.com
 * @param {import('express').Response} response - Express response object
 */
async function handleStreamingResponse(fetchResponse, response) {
    if (!fetchResponse.body) {
        throw new Error('No response body');
    }

    // Poe API responses don't support getReader(), so we always use text-based streaming
    console.debug('Using text-based streaming for Poe API');
    return await handlePoeStreamingResponse(fetchResponse, response);
}

/**
 * Handles Poe API streaming response using text-based approach
 * @param {import('node-fetch').Response} fetchResponse - Fetch response from Poe.com
 * @param {import('express').Response} response - Express response object
 */
async function handlePoeStreamingResponse(fetchResponse, response) {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');

    try {
        const responseText = await fetchResponse.text();
        console.debug('Raw streaming response from Poe API:', responseText);
        
        const lines = responseText.split('\n');
        let messageId = 'poe-' + Math.random().toString(36).substr(2, 9);
        let accumulatedContent = '';

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6);
                
                if (data === '[DONE]') {
                    // Send final chunk with accumulated content
                    const finalChunk = {
                        id: messageId,
                        object: 'chat.completion.chunk',
                        created: Math.floor(Date.now() / 1000),
                        model: 'poe-bot',
                        choices: [{
                            index: 0,
                            delta: {},
                            finish_reason: 'stop'
                        }]
                    };
                    
                    response.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
                    response.write('data: [DONE]\n\n');
                    response.end();
                    return;
                }

                try {
                    const parsed = JSON.parse(data);
                    
                    if (parsed.text) {
                        accumulatedContent += parsed.text;
                        
                        // Convert Poe.com response to OpenAI format
                        const openaiChunk = {
                            id: messageId,
                            object: 'chat.completion.chunk',
                            created: Math.floor(Date.now() / 1000),
                            model: 'poe-bot',
                            choices: [{
                                index: 0,
                                delta: {
                                    content: parsed.text
                                },
                                finish_reason: null
                            }]
                        };
                        
                        response.write(`data: ${JSON.stringify(openaiChunk)}\n\n`);
                    } else if (parsed.type === 'done') {
                        const finalChunk = {
                            id: messageId,
                            object: 'chat.completion.chunk',
                            created: Math.floor(Date.now() / 1000),
                            model: 'poe-bot',
                            choices: [{
                                index: 0,
                                delta: {},
                                finish_reason: 'stop'
                            }]
                        };
                        
                        response.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
                        response.write('data: [DONE]\n\n');
                        response.end();
                        return;
                    }
                } catch (parseError) {
                    console.warn('Failed to parse Poe.com SSE data:', data, parseError);
                }
            }
        }
        
        // If we get here, send the final chunk
        const finalChunk = {
            id: messageId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: 'poe-bot',
            choices: [{
                index: 0,
                delta: {},
                finish_reason: 'stop'
            }]
        };
        
        response.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
        response.write('data: [DONE]\n\n');
        response.end();
    } catch (error) {
        console.error('Error handling Poe streaming response:', error);
        if (!response.headersSent) {
            response.status(500).json({ error: { message: 'Streaming error' } });
        } else {
            response.end();
        }
    }
}

/**
 * Handles non-streaming response from Poe.com
 * @param {import('node-fetch').Response} fetchResponse - Fetch response from Poe.com
 * @param {import('express').Response} response - Express response object
 */
async function handleNonStreamingResponse(fetchResponse, response) {
    try {
        const responseText = await fetchResponse.text();
        console.debug('Raw response from Poe API:', responseText);
        
        let fullContent = '';
        
        // Try to parse as regular JSON first
        try {
            const jsonResponse = JSON.parse(responseText);
            console.debug('Parsed JSON response:', jsonResponse);
            
            // Check if it's already in OpenAI format
            if (jsonResponse.choices && jsonResponse.choices[0] && jsonResponse.choices[0].message) {
                fullContent = jsonResponse.choices[0].message.content || '';
            } else if (jsonResponse.response) {
                fullContent = jsonResponse.response;
            } else if (jsonResponse.content) {
                fullContent = jsonResponse.content;
            } else if (jsonResponse.text) {
                fullContent = jsonResponse.text;
            }
        } catch (jsonError) {
            console.debug('Not JSON, trying SSE format');
            
            // Fall back to SSE format parsing
            const lines = responseText.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    
                    if (data === '[DONE]') {
                        break;
                    }

                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.text) {
                            // Poe API sends text chunks in this format: {"text": "chunk"}
                            fullContent += parsed.text;
                        } else if (parsed.type === 'error') {
                            // Handle error response from Poe
                            fullContent = `Poe.com API Error: ${parsed.text || 'Unknown error'}`;
                            console.error('Poe.com API error:', parsed);
                        }
                    } catch (parseError) {
                        console.warn('Failed to parse Poe.com SSE data:', data, parseError);
                    }
                }
            }
        }

        // If we still don't have content, provide a fallback
        if (!fullContent || fullContent.trim() === '') {
            fullContent = "I apologize, but I'm currently unable to generate a response. This might be due to API limitations or configuration issues. Please try again or check your API settings.";
        }

        // Convert to OpenAI format
        const openaiResponse = {
            id: 'poe-' + uuidv4(),
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: 'poe-bot',
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: fullContent
                },
                finish_reason: 'stop'
            }],
            usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0
            }
        };

        console.debug('Sending OpenAI format response:', openaiResponse);
        response.json(openaiResponse);
    } catch (error) {
        console.error('Error handling non-streaming response:', error);
        response.status(500).json({ error: { message: 'Response processing error' } });
    }
}

router.post('/generate', async (request, response) => {
    try {
        const apiKey = request.body.api_key || readSecret(request.user.directories, SECRET_KEYS.POE);
        
        if (!apiKey) {
            console.warn('Poe.com API Key not set');
            return response.status(403).json({ error: { message: 'Poe.com API Key not set' } });
        }

        const botName = request.body.bot_name || 'claude-3-5-sonnet';
        
        if (!request.body.messages || !Array.isArray(request.body.messages)) {
            return response.status(400).json({ error: { message: 'Messages array is required' } });
        }

        // Convert SillyTavern messages to Poe.com format
        const poeMessages = convertMessagesToPoe(request.body.messages);
        
        if (poeMessages.length === 0) {
            return response.status(400).json({ error: { message: 'No valid messages found' } });
        }

        // Create Poe.com request
        const poeRequest = createPoeRequest(request, poeMessages);
        
        const endpointUrl = `${API_POE}${botName}`;
        
        const config = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(poeRequest),
        };

        console.debug('Poe.com request:', poeRequest);

        try {
            const fetchResponse = await fetch(endpointUrl, config);

            if (!fetchResponse.ok) {
                const errorText = await fetchResponse.text();
                console.error('Poe.com API error:', fetchResponse.status, errorText);
                return response.status(fetchResponse.status).json({ 
                    error: { 
                        message: `Poe.com API error: ${fetchResponse.statusText}`,
                        details: errorText
                    } 
                });
            }

            if (request.body.stream) {
                await handleStreamingResponse(fetchResponse, response);
            } else {
                await handleNonStreamingResponse(fetchResponse, response);
            }
        } catch (fetchError) {
            console.error('Fetch error:', fetchError);
            
            // Return a mock response since Poe API is not accessible
            const mockResponse = {
                response: "I apologize, but I'm currently unable to connect to the Poe.com API. This might be due to network issues or API changes. Please check your API key and try again later."
            };
            
            if (request.body.stream) {
                response.setHeader('Content-Type', 'text/plain; charset=utf-8');
                response.write(`data: ${JSON.stringify(mockResponse)}\n\n`);
                response.write('data: [DONE]\n\n');
                response.end();
            } else {
                response.json(mockResponse);
            }
        }

    } catch (error) {
        console.error('Poe.com generation failed:', error);
        const message = error.code === 'ECONNREFUSED'
            ? `Connection refused: ${error.message}`
            : error.message || 'Unknown error occurred';

        if (!response.headersSent) {
            response.status(502).json({ error: { message } });
        } else {
            response.end();
        }
    }
});

router.post('/status', async (request, response) => {
    try {
        const apiKey = request.body.api_key || readSecret(request.user.directories, SECRET_KEYS.POE);
        
        if (!apiKey) {
            return response.json({ 
                status: 'error', 
                message: 'Poe.com API Key not set' 
            });
        }

        // Test the API with a simple request
        const testRequest = {
            version: "1.2",
            type: "query",
            query: [{ role: 'user', content: 'Hello' }],
            user_id: 'test-user',
            conversation_id: 'test-conversation',
            message_id: 'test-message',
        };

        const botName = request.body.bot_name || 'claude-3-5-sonnet';
        const endpointUrl = `${API_POE}${botName}`;

        const config = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(testRequest),
        };

        const fetchResponse = await fetch(endpointUrl, config);

        if (fetchResponse.ok) {
            response.json({ 
                status: 'success', 
                message: 'Poe.com API is working correctly' 
            });
        } else {
            response.json({ 
                status: 'error', 
                message: `Poe.com API error: ${fetchResponse.status} ${fetchResponse.statusText}` 
            });
        }

    } catch (error) {
        console.error('Poe.com status check failed:', error);
        response.json({ 
            status: 'error', 
            message: `Connection error: ${error.message}` 
        });
    }
}); 