import { motion } from "motion/react";
import ReactMarkdown from "react-markdown";
import "./FinalOutput.css";

export default function FinalOutput({ content, thinkingChain, onClose, onReset }) {
  
  const handleDownload = () => {
    const chainText = thinkingChain.join(" → ");
    const fullContent = `# ThinkStorm Idea Proposal\n\n**Thinking Chain:** ${chainText}\n\n---\n\n${content}`;
    
    const blob = new Blob([fullContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `thinkstorm-${thinkingChain[0]?.toLowerCase().replace(/\s+/g, "-") || "idea"}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      alert("Copied to clipboard!");
    } catch {
      alert("Failed to copy");
    }
  };

  return (
    <motion.div 
      className="final-output-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div 
        className="final-output-container"
        initial={{ scale: 0.9, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 50 }}
        transition={{ type: "spring", damping: 25 }}
      >
        <header className="output-header">
          <div className="output-title-section">
            <h2>✨ Your Idea Proposal</h2>
            <div className="output-chain">
              {thinkingChain.map((item, i) => (
                <span key={i} className="output-chain-item">
                  {item}
                  {i < thinkingChain.length - 1 && " → "}
                </span>
              ))}
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </header>

        <div className="output-content">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>

        <footer className="output-footer">
          <button className="output-btn download" onClick={handleDownload}>
            📥 Download Markdown
          </button>
          <button className="output-btn copy" onClick={handleCopy}>
            📋 Copy to Clipboard
          </button>
          <button className="output-btn new" onClick={onReset}>
            🔄 Start New Brainstorm
          </button>
        </footer>
      </motion.div>
    </motion.div>
  );
}
