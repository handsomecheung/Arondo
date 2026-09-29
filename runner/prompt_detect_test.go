package main

import "testing"

func TestIsMatchingPasswordPrompt(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected bool
	}{
		{
			name:     "standard sudo prompt",
			input:    "[sudo] password for user: ",
			expected: true,
		},
		{
			name:     "sudo prompt without space",
			input:    "[sudo] password for box:",
			expected: true,
		},
		{
			name:     "sudo password prompt without user",
			input:    "[sudo] password: ",
			expected: true,
		},
		{
			name:     "Japanese sudo prompt",
			input:    "[sudo] box のパスワード: ",
			expected: true,
		},
		{
			name:     "Japanese sudo prompt without user",
			input:    "[sudo] パスワード: ",
			expected: true,
		},
		{
			name:     "Chinese sudo prompt",
			input:    "[sudo] box 的密码：",
			expected: true,
		},
		{
			name:     "Chinese sudo prompt without user",
			input:    "[sudo] 密码：",
			expected: true,
		},
		{
			name:     "ANSI styled sudo prompt",
			input:    "\x1b[31m[sudo]\x1b[0m password for \x1b[1mbox\x1b[0m: ",
			expected: true,
		},
		{
			name:     "multi-line with sudo prompt at the end",
			input:    "Updating repositories...\n[sudo] password for user: ",
			expected: true,
		},
		{
			name:     "multi-line with trailing blank lines after sudo prompt",
			input:    "[sudo] password for user: \r\n",
			expected: true,
		},
		{
			name:     "simple non-sudo Password prompt",
			input:    "Password:",
			expected: false,
		},
		{
			name:     "non-sudo Enter password prompt",
			input:    "Enter password: ",
			expected: false,
		},
		{
			name:     "non-sudo Passphrase prompt",
			input:    "Passphrase: ",
			expected: false,
		},
		{
			name:     "normal log message containing word password",
			input:    "Password updated successfully.\nDone.",
			expected: false,
		},
		{
			name:     "log line with password answered",
			input:    "[sudo] password for user: *******",
			expected: false,
		},
		{
			name:     "regular command output",
			input:    "total 12\ndrwxr-xr-x 2 user user 4096 Sep 29 10:00 .",
			expected: false,
		},
		{
			name:     "empty buffer",
			input:    "",
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isMatchingPasswordPrompt([]byte(tt.input))
			if got != tt.expected {
				t.Errorf("isMatchingPasswordPrompt(%q) = %v, want %v", tt.input, got, tt.expected)
			}
		})
	}
}
