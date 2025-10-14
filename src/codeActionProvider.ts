import * as vscode from 'vscode';
import * as path from 'path';
import Logger from './logger';

/**
 * CodeActionProvider that adds "Ask to Claude Code" quick fix
 * for all diagnostics (errors, warnings, info)
 */
export class ClaudeCodeActionProvider implements vscode.CodeActionProvider {
	constructor(private logger: Logger) {}

	provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range,
		context: vscode.CodeActionContext,
		token: vscode.CancellationToken
	): vscode.CodeAction[] {
		this.logger.info(`provideCodeActions called for ${document.fileName}`);
		this.logger.info(`Range: ${range.start.line}:${range.start.character} to ${range.end.line}:${range.end.character}`);
		this.logger.info(`Diagnostics count: ${context.diagnostics.length}`);

		const actions: vscode.CodeAction[] = [];

		if (context.diagnostics.length === 0) {
			this.logger.warn('No diagnostics found at this position');
			return actions;
		}

		// Create quick fix for each diagnostic at current position
		for (const diagnostic of context.diagnostics) {
			this.logger.info(`Creating action for diagnostic: ${diagnostic.message}`);
			this.logger.info(`Diagnostic severity: ${diagnostic.severity}`);
			const action = this.createAskClaudeCodeAction(document, diagnostic);
			actions.push(action);
		}

		this.logger.info(`Returning ${actions.length} code actions`);
		return actions;
	}

	private createAskClaudeCodeAction(
		document: vscode.TextDocument,
		diagnostic: vscode.Diagnostic
	): vscode.CodeAction {
		const action = new vscode.CodeAction(
			'Ask to Claude Code',
			vscode.CodeActionKind.QuickFix
		);

		// Set command to execute when quick fix is selected
		action.command = {
			command: 'cliagent-mention.askClaudeCode',
			title: 'Ask Claude Code about this problem',
			arguments: [document, diagnostic]
		};

		// Mark this action as preferred (shows first in the list)
		action.isPreferred = false;

		// Associate with the diagnostic
		action.diagnostics = [diagnostic];

		return action;
	}
}

/**
 * Get diagnostic severity as string
 */
function getDiagnosticSeverityString(severity: vscode.DiagnosticSeverity): string {
	switch (severity) {
		case vscode.DiagnosticSeverity.Error:
			return 'Error';
		case vscode.DiagnosticSeverity.Warning:
			return 'Warning';
		case vscode.DiagnosticSeverity.Information:
			return 'Information';
		case vscode.DiagnosticSeverity.Hint:
			return 'Hint';
		default:
			return 'Unknown';
	}
}

/**
 * Handle "Ask to Claude Code" command from command palette
 * Finds diagnostic at current cursor position
 */
export async function handleAskClaudeCodeCommand(logger: Logger): Promise<void> {
	logger.debug('handleAskClaudeCodeCommand called from command palette');

	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showWarningMessage('No active editor');
		return;
	}

	const document = editor.document;
	const position = editor.selection.active;

	// Get diagnostics at current position
	const diagnostics = vscode.languages.getDiagnostics(document.uri);
	const diagnosticAtCursor = diagnostics.find(diag =>
		diag.range.contains(position)
	);

	if (!diagnosticAtCursor) {
		vscode.window.showWarningMessage('No diagnostic found at current cursor position');
		logger.warn('No diagnostic at cursor position');
		return;
	}

	logger.debug(`Found diagnostic at cursor: ${diagnosticAtCursor.message}`);
	await handleAskClaudeCode(document, diagnosticAtCursor, logger);
}

/**
 * Handle "Ask to Claude Code" command
 * Sends mention + error message to terminal
 */
export async function handleAskClaudeCode(
	document: vscode.TextDocument,
	diagnostic: vscode.Diagnostic,
	logger: Logger
): Promise<void> {
	logger.debug('handleAskClaudeCode called');
	logger.debug(`Document: ${document.uri.fsPath}`);
	logger.debug(`Diagnostic: ${diagnostic.message}`);

	try {
		// Get or create terminal
		let terminal = vscode.window.activeTerminal;
		if (!terminal) {
			logger.debug('No active terminal, creating new one');
			terminal = vscode.window.createTerminal('Claude Code');
		}
		logger.debug(`Using terminal: ${terminal.name}`);

		// Calculate file path
		let filePath: string;

		// Try to get relative path from workspace
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
		if (workspaceFolder) {
			filePath = vscode.workspace.asRelativePath(document.uri, false);
			logger.debug(`Using workspace relative path: ${filePath}`);
		} else {
			// Fallback to absolute path
			filePath = document.uri.fsPath;
			logger.warn(`No workspace folder, using absolute path: ${filePath}`);
		}

		// Send to terminal
		sendToTerminal(terminal, filePath, diagnostic, logger);
		logger.debug('Successfully sent to terminal');

	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error(`Failed to send to terminal: ${errorMessage}`);
		logger.error(`Stack trace: ${error instanceof Error ? error.stack : 'N/A'}`);
		vscode.window.showErrorMessage(`Failed to send diagnostic to Claude Code: ${errorMessage}`);
	}
}

/**
 * Send mention + diagnostic info to terminal
 */
function sendToTerminal(
	terminal: vscode.Terminal,
	filePath: string,
	diagnostic: vscode.Diagnostic,
	logger: Logger
): void {
	try {
		logger.debug('sendToTerminal called');
		logger.debug(`File path: ${filePath}`);
		logger.debug(`Diagnostic range: ${diagnostic.range.start.line}-${diagnostic.range.end.line}`);

		// Build mention string: @file.py#L10 or @file.py#L10-15
		const startLine = diagnostic.range.start.line + 1; // 0-based → 1-based
		const endLine = diagnostic.range.end.line + 1;

		let mention = `@${filePath}`;
		if (startLine === endLine) {
			mention += `#L${startLine}`;
		} else {
			mention += `#L${startLine}-${endLine}`;
		}
		logger.debug(`Mention: ${mention}`);

		// Build error message
		const severity = getDiagnosticSeverityString(diagnostic.severity);
		// const source = diagnostic.source ? `[${diagnostic.source}] ` : '';
		const message = diagnostic.message;

		// Get quick fix prompt from configuration
		const config = vscode.workspace.getConfiguration('cliagent-mention');
		const quickFixPrompt = config.get<string>('quickFixPrompt', 'Analyze this error/warning and provide to solve it solution.');
		// logger.debug(`Using quick fix prompt: ${quickFixPrompt}`);

		// const fullCommand = `${quickFixPrompt}\n\n${mention}\n${source}${severity}: ${message}`;
		// Format: quickFixPrompt \n\n @file.py#L10 \n severity: message
		const fullCommand = `${quickFixPrompt}\n\n${mention}\n${severity}: ${message}`;

		logger.info(`Sending to terminal: ${fullCommand}`);

		// Send to terminal (false = don't press Enter, let user review)
		terminal.sendText(fullCommand, false);
		terminal.show();

		logger.debug('Text sent to terminal successfully');
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error(`Error in sendToTerminal: ${errorMessage}`);
		throw error; // Re-throw to be caught by caller
	}
}
