// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as pathNative from 'path';
import * as vscode from 'vscode';
import { Uri } from 'vscode';
import Logger from './logger';
import { updateLogLevel } from './config';
import { ClaudeCodeActionProvider, handleAskClaudeCode, handleAskClaudeCodeCommand } from './codeActionProvider';

export let prefixString = "@";
export let suffixString = ":";

// Windows drive letter pattern (C:\, D:\, etc.)
const windowsDrivePattern = /^([A-Za-z]):[\\\/]/;

/**
 * Check if a path is a Windows path (starts with drive letter like C:\)
 */
function isWindowsPath(filePath: string): boolean {
	return windowsDrivePattern.test(filePath);
}

/**
 * Get drive letter from Windows path (returns lowercase)
 * e.g., C:\Users\test -> 'c', D:\data -> 'd'
 */
function getWindowsDriveLetter(filePath: string): string | undefined {
	const match = filePath.match(windowsDrivePattern);
	return match ? match[1].toLowerCase() : undefined;
}

/**
 * Check if a path is a WSL mount path (starts with /mnt/)
 */
function isWslMountPath(filePath: string): boolean {
	return /^\/mnt\/[a-z]\//i.test(filePath);
}

/**
 * Convert Windows path to WSL path
 * e.g., C:\Users\test\file.txt -> /mnt/c/Users/test/file.txt
 */
function windowsToWslPath(windowsPath: string): string {
	const match = windowsPath.match(windowsDrivePattern);
	if (!match) {
		return windowsPath;
	}
	const driveLetter = match[1].toLowerCase();
	// Remove drive letter and colon, replace backslashes with forward slashes
	const pathWithoutDrive = windowsPath.substring(2).replace(/\\/g, '/');
	return `/mnt/${driveLetter}${pathWithoutDrive}`;
}

/**
 * Calculate relative path, handling Windows VSCode + WSL terminal case
 */
function toRelative(from: Uri | undefined, to: Uri | undefined): string | undefined {
	if (!from || !to) {
		return undefined;
	}

	let fromPath = from.fsPath;
	let toPath = to.fsPath;

	// Handle Windows different drives case (e.g., terminal on E:\, file on C:\)
	// Return absolute path when drives are different
	if (isWindowsPath(fromPath) && isWindowsPath(toPath)) {
		const fromDrive = getWindowsDriveLetter(fromPath);
		const toDrive = getWindowsDriveLetter(toPath);
		if (fromDrive && toDrive && fromDrive !== toDrive) {
			// Different drives - return absolute path (keep backslashes for Windows terminal)
			return toPath;
		}
	}

	// Handle Windows VSCode + WSL terminal case:
	// - File path is Windows style (C:\...)
	// - Terminal cwd is WSL style (/mnt/c/...)
	if (isWslMountPath(fromPath) && isWindowsPath(toPath)) {
		// Convert Windows file path to WSL path for proper relative calculation
		toPath = windowsToWslPath(toPath);
		// Use POSIX-style relative calculation
		const posixPath = require('path/posix');
		return posixPath.relative(fromPath, toPath);
	}

	// Handle reverse case: WSL file + Windows terminal (less common but possible)
	if (isWindowsPath(fromPath) && isWslMountPath(toPath)) {
		fromPath = windowsToWslPath(fromPath);
		const posixPath = require('path/posix');
		return posixPath.relative(fromPath, toPath);
	}

	// Standard case: both paths are same type
	// Use native path for proper relative calculation on all platforms (Windows: \, Unix: /)
	const relativePath = pathNative.relative(fromPath, toPath);

	// Keep backslashes for Windows terminal (PowerShell, CMD)
	// Use forward slashes for Unix/WSL terminal
	if (isWindowsPath(fromPath)) {
		return relativePath;
	}
	return relativePath.split(pathNative.sep).join('/');
}


function getRelativePathWithTerminal(editor: vscode.TextEditor | undefined, terminal: vscode.Terminal | undefined, logprinter: Logger): string | undefined {
	if (!terminal) {
		logprinter.info('No active terminal found. Please open a terminal and try again.');
		return undefined;
	}
	if (!editor) {
		logprinter.info('No active text editor found. Please open a file and try again.');
		return undefined;
	}

	// Get the current working directory of the terminal directly from shellIntegration.cwd
	const cwd = terminal.shellIntegration?.cwd;
	if (!cwd) {
		logprinter.info('Unable to get terminal path. Shell integration may not be available.');
		return undefined;
	}
	logprinter.debug(`Current terminal path: ${cwd.fsPath}`);

	// Get the file path of the currently active text editor.
	const fileUri = editor?.document.uri;
	if (!fileUri) {
		logprinter.info('No active text editor found. Please open a file and try again.');
		return undefined;
	}
	logprinter.debug(`Active file path: ${fileUri.fsPath}`);


	// Get the relative path from terminal cwd to the active file path.
	// Linux / MacOS ex: terminal path: /home/user/project/src, file path: /home/user/note/note.txt -> ../../note/note.txt
	// Windows ex: terminal path: C:\Users\test\project\src\dist, file path: C:\Users\test\note\note.txt -> ..\..\..\note\note.txt
	return toRelative(cwd, fileUri);
}

function getClaudeCodeFormatLineSelected(startLine: number, endLine: number): string {
	if (startLine === endLine) {
		return `#L${startLine}`;
	} else {
		return `#L${startLine}-${endLine}`;
	}
}

function getCodexFormatLineSelected(startLine: number, endLine: number): string {
	if (startLine === endLine) {
		return `:${startLine}`;
	} else {
		return `:${startLine}-${endLine}`;
	}
}
function getCustomFormatLineSelected(startLine: number, endLine: number): string {
	if (startLine === endLine) {
		return `${suffixString}${startLine}`;
	} else {
		return `${suffixString}${startLine}-${endLine}`;
	}
}

function setMentionStrings(logger: Logger, mentionFormatedFunc: (startLine: number, endLine: number) => string) {
	// logger.show(); // Output 채널을 명시적으로 표시
	const editor = vscode.window.activeTextEditor;
	const terminal = vscode.window.activeTerminal;
	const relativePath = getRelativePathWithTerminal(editor, terminal, logger);
	if (!relativePath) {
		logger.warn('Unable to compute relative path.');
		return;
	}
	logger.debug(`Relative path from terminal to file: ${relativePath}`);


	let mentionedText = prefixString + relativePath;
	if (editor?.selection.isEmpty == false) {
		const startLine: number = editor.selection.start.line + 1; // 0-based index, so +1
		const endLine: number = editor.selection.end.line + 1;
		const lineAdder: string = mentionFormatedFunc(startLine, endLine);
		mentionedText += lineAdder;
	}
	mentionedText += " ";
	logger.debug('codex mentionedText: [' + mentionedText + ']');
	if (logger.getLogLevel() <= vscode.LogLevel.Trace) {
		vscode.window.showInformationMessage(mentionedText);
	}

	// print mentioned text in terminal
	terminal?.sendText(mentionedText, false);

	// terminal focus
	terminal?.show();
}


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Create output channel for debug logging
	const outputChannel = vscode.window.createOutputChannel('cliagent-mention', { log: true });
	context.subscriptions.push(outputChannel);

	// Create logger wrapper
	const logger = new Logger(outputChannel);
	context.subscriptions.push(logger); // Logger도 Disposable이므로 subscriptions에 추가

	// Load initial configuration
	const config = vscode.workspace.getConfiguration('cliagent-mention');
	updateLogLevel(config, logger);

	// Load initial prefix and suffix strings from configuration
	prefixString = config.get<string>('prefixString', '@');
	suffixString = config.get<string>('suffixString', ':');
	logger.info(`Initial configuration loaded - Prefix: ${prefixString}, Suffix: ${suffixString}`);

	// Watch for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('cliagent-mention.logLevel')) {
				const config = vscode.workspace.getConfiguration('cliagent-mention');
				updateLogLevel(config, logger);
				logger.info('Log level updated');
			}
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('cliagent-mention.prefixString')) {
				const config = vscode.workspace.getConfiguration('cliagent-mention');
				prefixString = config.get<string>('prefixString', '@');
				logger.info(`Prefix string updated to: ${prefixString}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('cliagent-mention.suffixString')) {
				const config = vscode.workspace.getConfiguration('cliagent-mention');
				suffixString = config.get<string>('suffixString', ':');
				logger.info(`Suffix string updated to: ${suffixString}`);
			}
		})
	);

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable1 = vscode.commands.registerCommand('cliagent-mention.codexMention', () => {
		setMentionStrings(logger, getCodexFormatLineSelected);
	});

	const disposable2 = vscode.commands.registerCommand('cliagent-mention.claudecodeMention', () => {
		setMentionStrings(logger, getClaudeCodeFormatLineSelected);
	});

	const disposable3 = vscode.commands.registerCommand('cliagent-mention.customMention', () => {
		setMentionStrings(logger, getCustomFormatLineSelected);
	});

	// Register "Ask to Claude Code" command
	// Supports two modes:
	// 1. From Quick Fix: receives document and diagnostic arguments
	// 2. From Command Palette: no arguments, finds diagnostic at cursor
	const disposable4 = vscode.commands.registerCommand(
		'cliagent-mention.askClaudeCode',
		async (document?: vscode.TextDocument, diagnostic?: vscode.Diagnostic) => {
			if (document && diagnostic) {
				// Called from Quick Fix with arguments
				logger.debug('Command called from Quick Fix');
				await handleAskClaudeCode(document, diagnostic, logger);
			} else {
				// Called from Command Palette without arguments
				logger.debug('Command called from Command Palette');
				await handleAskClaudeCodeCommand(logger);
			}
		}
	);

	// Register CodeActionProvider for all languages
	// Support both 'file' and 'untitled' schemes to work in all contexts
	const codeActionProvider = vscode.languages.registerCodeActionsProvider(
		'*', // Apply to all file types
		new ClaudeCodeActionProvider(logger),
		{
			providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
		}
	);

	logger.info('CodeActionProvider registered successfully');

	context.subscriptions.push(disposable1);
	context.subscriptions.push(disposable2);
	context.subscriptions.push(disposable3);
	context.subscriptions.push(disposable4);
	context.subscriptions.push(codeActionProvider);
}

// This method is called when your extension is deactivated
export function deactivate() {
	// context.subscriptions에 추가된 모든 리소스는 자동으로 dispose됨.
}
