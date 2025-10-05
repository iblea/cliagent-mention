// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import path from 'path/posix';
import * as vscode from 'vscode';
import { Uri } from 'vscode';
import Logger from './logger';
import { updateLogLevel } from './config';

export let prefixString = "@";
export let suffixString = ":";

function toRelative(from: Uri | undefined, to: Uri | undefined): string | undefined {
	if (!from || !to) {
		return undefined;
	}
	return path.relative(from.fsPath, to.fsPath);
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

	context.subscriptions.push(disposable1);
	context.subscriptions.push(disposable2);
	context.subscriptions.push(disposable3);
}

// This method is called when your extension is deactivated
export function deactivate() {
	// context.subscriptions에 추가된 모든 리소스는 자동으로 dispose됨.
}
