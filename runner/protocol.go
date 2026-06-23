package main

import (
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
)

type MessageType string

const (
	TypeRequest  MessageType = "request"
	TypeResponse MessageType = "response"
	TypeStream   MessageType = "stream"
	TypeEvent    MessageType = "event"
)

type Message struct {
	ID      string          `json:"id"`
	Type    MessageType     `json:"type"`
	Method  string          `json:"method,omitempty"`
	Payload json.RawMessage `json:"payload"`
}

func NewID() string {
	return fmt.Sprintf("msg_%s", uuid.New().String()[:8])
}

func NewResponse(reqID string, payload any) (*Message, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return &Message{
		ID:      reqID,
		Type:    TypeResponse,
		Payload: data,
	}, nil
}

func NewStream(method string, payload any) (*Message, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return &Message{
		ID:      NewID(),
		Type:    TypeStream,
		Method:  method,
		Payload: data,
	}, nil
}

func NewEvent(method string, payload any) (*Message, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return &Message{
		ID:      NewID(),
		Type:    TypeEvent,
		Method:  method,
		Payload: data,
	}, nil
}

type OkResponse struct {
	OK bool `json:"ok"`
}

type ErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type ErrorResponse struct {
	OK    bool         `json:"ok"`
	Error ErrorPayload `json:"error"`
}

func NewErrorResponse(reqID, code, message string) (*Message, error) {
	return NewResponse(reqID, ErrorResponse{
		OK:    false,
		Error: ErrorPayload{Code: code, Message: message},
	})
}
