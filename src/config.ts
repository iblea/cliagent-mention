import * as vscode from 'vscode';
import Logger from './logger';

export const updateLogLevel = (config: vscode.WorkspaceConfiguration, logger: Logger) => {
	const logLevel = config.get<string>('logLevel', 'debug');

	switch (logLevel.toLowerCase()) {
		case 'off':
			logger.setLogLevel(vscode.LogLevel.Off);
			break;
		case 'trace':
			logger.setLogLevel(vscode.LogLevel.Trace);
			break;
		case 'debug':
			logger.setLogLevel(vscode.LogLevel.Debug);
			break;
		case 'info':
			logger.setLogLevel(vscode.LogLevel.Info);
			break;
		case 'warn':
			logger.setLogLevel(vscode.LogLevel.Warning);
			break;
		case 'error':
			logger.setLogLevel(vscode.LogLevel.Error);
			break;
		default:
			logger.setLogLevel(vscode.LogLevel.Debug);
	}
};
