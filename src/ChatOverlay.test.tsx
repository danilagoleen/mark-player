import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatOverlay } from "./ChatOverlay";
import type { FoveaContext } from "./fovea";

const fakeContext: FoveaContext = {
  timecode: "00:01:00.000",
  frame_b64: null,
  width: 320,
  height: 240,
  duration: 60,
};

const mockSend = vi.fn().mockResolvedValue({
  id: "resp_1",
  role: "assistant",
  text: "I see a bright scene.",
  created_at: new Date().toISOString(),
});

vi.mock("./chatApi", () => ({
  sendChatMessage: (...args: unknown[]) => mockSend(...args),
}));

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  mentionToInsert: null,
  onMentionConsumed: vi.fn(),
  onOpenPhonebook: vi.fn(),
  onOpenChatHistory: vi.fn(),
};

afterEach(cleanup);

describe("ChatOverlay", () => {
  it("renders chat window when open", () => {
    render(<ChatOverlay foveaContext={null} {...defaultProps} />);
    expect(screen.getByPlaceholderText(/Type a message/i)).toBeDefined();
  });

  it("does not render when closed", () => {
    render(<ChatOverlay foveaContext={null} {...defaultProps} open={false} />);
    expect(screen.queryByPlaceholderText(/Type a message/i)).toBeNull();
  });

  it("sends message and shows response", async () => {
    const user = userEvent.setup();
    render(<ChatOverlay foveaContext={null} {...defaultProps} />);
    const input = screen.getByPlaceholderText(/Type a message/i);
    await user.type(input, "What do you see?");
    await user.keyboard("{Enter}");
    expect(await screen.findByText("What do you see?")).toBeDefined();
    expect(await screen.findByText("I see a bright scene.")).toBeDefined();
  });

  it("shows vision button when fovea context present", () => {
    render(<ChatOverlay foveaContext={fakeContext} {...defaultProps} />);
    expect(screen.getByTitle(/Analyze current frame/i)).toBeDefined();
  });

  it("calls onOpenChatHistory when history button clicked", async () => {
    const onHistory = vi.fn();
    const user = userEvent.setup();
    render(<ChatOverlay foveaContext={null} {...defaultProps} onOpenChatHistory={onHistory} />);
    await user.click(screen.getByTitle(/Chat history/i));
    expect(onHistory).toHaveBeenCalledOnce();
  });

  it("calls onOpenPhonebook when phonebook button clicked", async () => {
    const onPhonebook = vi.fn();
    const user = userEvent.setup();
    render(<ChatOverlay foveaContext={null} {...defaultProps} onOpenPhonebook={onPhonebook} />);
    await user.click(screen.getByTitle(/Model Directory/i));
    expect(onPhonebook).toHaveBeenCalledOnce();
  });
});
