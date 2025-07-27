/*
* CODE FOR POE.COM SUPPORT
* Integration for Poe.com API
*/
import { Fuse, DOMPurify } from '../lib.js';

import {
    abortStatusCheck,
    characters,
    event_types,
    eventSource,
    extension_prompt_roles,
    extension_prompt_types,
    Generate,
    getExtensionPrompt,
    getExtensionPromptMaxDepth,
    getRequestHeaders,
    getStoppingStrings,
    is_send_press,
    main_api,
    name1,
    name2,
    resultCheckStatus,
    saveSettingsDebounced,
    setOnlineStatus,
    startStatusLoading,
    substituteParams,
    substituteParamsExtended,
    system_message_types,
    this_chid,
} from '../script.js';
import { getGroupNames, selected_group } from './group-chats.js';

import {
    chatCompletionDefaultPrompts,
    INJECTION_POSITION,
    Prompt,
    PromptManager,
    promptManagerDefaultPromptOrders,
} from './PromptManager.js';

import { forceCharacterEditorTokenize, getCustomStoppingStrings, persona_description_positions, power_user } from './power-user.js';
import { SECRET_KEYS, secret_state, writeSecret } from './secrets.js';

import { getEventSourceStream } from './sse-stream.js';
import {
    createThumbnail,
    delay,
    download,
    getBase64Async,
    getFileText,
    getImageSizeFromDataURL,
    getSortableDelay,
    getStringHash,
    isDataURL,
    isUuid,
    isValidUrl,
    parseJsonFile,
    resetScrollHeight,
    stringFormat,
    textValueMatcher,
    uuidv4,
} from './utils.js';
import { countTokensOpenAIAsync, getTokenizerModel } from './tokenizers.js';
import { isMobile } from './RossAscends-mods.js';
import { saveLogprobsForActiveMessage } from './logprobs.js';
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument } from './slash-commands/SlashCommandArgument.js';
import { renderTemplateAsync } from './templates.js';
import { SlashCommandEnumValue } from './slash-commands/SlashCommandEnumValue.js';
import { callGenericPopup, Popup, POPUP_RESULT, POPUP_TYPE } from './popup.js';
import { t } from './i18n.js';
import { ToolManager } from './tool-calling.js';
import { accountStorage } from './util/AccountStorage.js';
import { IGNORE_SYMBOL } from './constants.js';

export {
    poe_settings,
    loadPoeSettings,
    sendPoeRequest,
    getStatusPoe,
    testPoeConnection,
};

let poe_settings = {
    bot_name: 'claude-3-5-sonnet',
    temperature: 0.7,
    skip_system_prompt: false,
    stream: true,
    user_id: '',
    conversation_id: '',
    message_id: '',
};

const default_main_prompt = 'Write {{char}}\'s next reply in a fictional chat between {{charIfNotGroup}} and {{user}}.';
const default_nsfw_prompt = '';
const default_jailbreak_prompt = '';
const default_impersonation_prompt = '[Write your next reply from the point of view of {{user}}, using the chat history so far as a guideline for the writing style of {{user}}. Don\'t write as {{char}} or system. Don\'t describe actions of {{char}}.]';
const default_enhance_definitions_prompt = 'If you have more knowledge of {{char}}, add to the character\'s lore and personality to enhance them but keep the Character Sheet\'s definitions absolute.';
const default_wi_format = '{0}';

/**
 * Load Poe.com settings from the UI
 */
function loadPoeSettings() {
    poe_settings.bot_name = String($('#poe_bot_name').val() || 'claude-3-5-sonnet');
    poe_settings.temperature = parseFloat(String($('#poe_temperature').val() || '0.7'));
    poe_settings.skip_system_prompt = $('#poe_skip_system_prompt').is(':checked');
    poe_settings.stream = $('#poe_stream').is(':checked');
    poe_settings.user_id = '';
    poe_settings.conversation_id = '';
    poe_settings.message_id = '';
}

/**
 * Send a request to Poe.com API
 * @param {string} type - Request type
 * @param {Array} messages - Array of messages
 * @param {AbortSignal} signal - Abort signal
 * @returns {Promise} Response from Poe.com
 */
async function sendPoeRequest(type, messages, signal) {
    loadPoeSettings();

    // Check if API key is available in secret state or input field
    if (!secret_state[SECRET_KEYS.POE]) {
        const inputKey = $('#poe_api_key').val();
        if (!inputKey || inputKey.toString().trim().length === 0) {
            throw new Error('Poe.com API Key not set. Please enter your API key and click the save button.');
        }
    }

    // Get API key from secret state or input field
    let apiKey = '';
    if (secret_state[SECRET_KEYS.POE] && Array.isArray(secret_state[SECRET_KEYS.POE]) && secret_state[SECRET_KEYS.POE].length > 0) {
        apiKey = secret_state[SECRET_KEYS.POE][0].value || '';
    } else {
        const inputKey = $('#poe_api_key').val();
        if (inputKey && inputKey.toString().trim().length > 0) {
            apiKey = inputKey.toString().trim();
        }
    }

    const requestBody = {
        messages: messages,
        bot_name: poe_settings.bot_name,
        temperature: poe_settings.temperature,
        skip_system_prompt: poe_settings.skip_system_prompt,
        stream: poe_settings.stream,
        user_id: poe_settings.user_id || '',
        conversation_id: poe_settings.conversation_id || '',
        message_id: poe_settings.message_id || '',
        api_key: apiKey,
    };

    const response = await fetch('/api/backends/poe/generate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getRequestHeaders(),
        },
        body: JSON.stringify(requestBody),
        signal: signal,
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    return response;
}

/**
 * Get Poe.com API status
 * @returns {Promise} Status response
 */
async function getStatusPoe() {
    loadPoeSettings();

    // Check if API key is available
    if (!secret_state[SECRET_KEYS.POE]) {
        const inputKey = $('#poe_api_key').val();
        if (!inputKey || inputKey.toString().trim().length === 0) {
            return { status: 'error', message: 'Poe.com API Key not set. Please enter your API key and click the save button.' };
        }
    }

    // Get API key from secret state or input field
    let apiKey = '';
    if (secret_state[SECRET_KEYS.POE] && Array.isArray(secret_state[SECRET_KEYS.POE]) && secret_state[SECRET_KEYS.POE].length > 0) {
        apiKey = secret_state[SECRET_KEYS.POE][0].value || '';
    } else {
        const inputKey = $('#poe_api_key').val();
        if (inputKey && inputKey.toString().trim().length > 0) {
            apiKey = inputKey.toString().trim();
        }
    }

    const requestBody = {
        bot_name: poe_settings.bot_name,
        api_key: apiKey,
    };

    const response = await fetch('/api/backends/poe/status', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getRequestHeaders(),
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        return { status: 'error', message: `HTTP ${response.status}` };
    }

    return await response.json();
}

/**
 * Test Poe.com connection
 * @returns {Promise} Test result
 */
async function testPoeConnection() {
    try {
        startStatusLoading('poe');
        const result = await getStatusPoe();
        
        if (result.status === 'success') {
            setOnlineStatus('poe', true);
            toastr.success('Poe.com connection successful');
        } else {
            setOnlineStatus('poe', false);
            toastr.error(`Poe.com connection failed: ${result.message}`);
        }
    } catch (error) {
        console.error('Poe.com connection test failed:', error);
        setOnlineStatus('poe', false);
        toastr.error(`Poe.com connection test failed: ${error.message}`);
    } finally {
        abortStatusCheck('poe');
    }
}

/**
 * Initialize Poe.com integration
 */
export function initPoe() {
    // Bind events for Poe.com settings
    $(document).on('click', '#poe_test_connection', testPoeConnection);
    $(document).on('click', '#poe_save_api_key', savePoeApiKey);
    
    // Handle temperature slider display
    $(document).on('input', '#poe_temperature', function() {
        $('#poe_temperature_display').text($(this).val());
    });

    // Load Poe.com settings from UI
    loadPoeSettings();
}

/**
 * Save Poe.com API key from input field to secrets
 */
async function savePoeApiKey() {
    const apiKey = $('#poe_api_key').val();
    if (!apiKey || apiKey.toString().trim().length === 0) {
        toastr.error('Please enter your Poe.com API key first');
        return;
    }
    
    try {
        await writeSecret(SECRET_KEYS.POE, apiKey.toString().trim(), 'Poe.com API Key');
        toastr.success('Poe.com API key saved successfully');
        // Clear the input field for security
        $('#poe_api_key').val('');
    } catch (error) {
        console.error('Failed to save Poe.com API key:', error);
        toastr.error('Failed to save API key');
    }
}

// Initialize when document is ready
$(document).ready(function() {
    initPoe();
}); 