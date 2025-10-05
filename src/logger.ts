
import * as vscode from 'vscode';

// Logger wrapper to control log level via configuration
export default class Logger implements vscode.Disposable {
	private outputChannel: vscode.LogOutputChannel;
	private _logLevel: vscode.LogLevel = vscode.LogLevel.Info;

	constructor(outputChannel: vscode.LogOutputChannel) {
		this.outputChannel = outputChannel;
	}

	setLogLevel(level: vscode.LogLevel) {
		this._logLevel = level;
		console.log('[Logger] Log level set to:', level, '(Off=0, Trace=1, Debug=2, Info=3, Warning=4, Error=5)');
	}

	getLogLevel(): vscode.LogLevel {
		return this._logLevel;
	}

	trace(message: string, ...args: any[]) {
		if (this._logLevel <= vscode.LogLevel.Trace) {
			this.outputChannel.trace(message, ...args);
		}
	}

	debug(message: string, ...args: any[]) {
		console.log('[Logger.debug] Current level:', this._logLevel, 'Debug level:', vscode.LogLevel.Debug, 'Should log:', this._logLevel <= vscode.LogLevel.Debug);
		if (this._logLevel <= vscode.LogLevel.Debug) {
			this.outputChannel.debug(message, ...args);
		}
	}

	info(message: string, ...args: any[]) {
		if (this._logLevel <= vscode.LogLevel.Info) {
			this.outputChannel.info(message, ...args);
		}
	}

	warn(message: string, ...args: any[]) {
		if (this._logLevel <= vscode.LogLevel.Warning) {
			this.outputChannel.warn(message, ...args);
		}
	}

	error(error: string | Error, ...args: any[]) {
		if (this._logLevel <= vscode.LogLevel.Error) {
			this.outputChannel.error(error, ...args);
		}
	}

	show() {
		this.outputChannel.show();
	}

	dispose() {
		// OutputChannel은 context.subscriptions에 추가되어 자동으로 dispose되므로
		// 여기서는 Logger 자체의 정리만 수행
		// this.outputChannel.dispose()는 호출하지 않음
	}
}
