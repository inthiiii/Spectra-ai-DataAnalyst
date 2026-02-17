# ⚡️ Spectra: Autonomous AI Data Analyst

![Spectra UI](https://via.placeholder.com/1200x600.png?text=Spectra+Dashboard+Preview) 
*(Replace this link with your actual screenshot later)*

Spectra is a next-generation **AI Data Agent** that bridges the gap between raw data and actionable insights. Unlike standard chatbots, Spectra doesn't just "talk" about data—it **writes and executes Python code** in a secure cloud sandbox to analyze datasets, generate visualizations, and browse the live internet to explain *why* trends are happening.

## 🚀 Features

* **📂 Drag-and-Drop Ingestion:** Instantly load CSV datasets via a "Glassmorphism" UI.
* **🐍 Secure Code Execution:** Uses **E2B Sandboxes** to run generated Python code safely in the cloud (no local execution risks).
* **📊 Autonomous Visualization:** Automatically detects data types and generates Matplotlib charts (Bar, Line, Scatter, etc.).
* **🌎 Context-Aware Research:** Integrated with **Tavily Search API** to cross-reference data anomalies with real-world news and events.
* **🧠 Recursive Reasoning:** Built on **LangGraph**, allowing the agent to self-correct errors and plan complex analysis steps.

## 🛠️ Tech Stack

### **Frontend (The "Wow" Factor)**
* **Framework:** Next.js 14 (App Router)
* **Styling:** Tailwind CSS + Framer Motion (Glassmorphism & Animations)
* **Icons:** Lucide React

### **Backend (The "Brain")**
* **API:** FastAPI (Python)
* **Orchestration:** LangChain + LangGraph
* **LLM:** OpenAI GPT-4o
* **Sandboxing:** E2B Code Interpreter
* **Search:** Tavily API

---

## ⚡️ Quick Start

### 1. Clone the Repository
```bash
git clone [https://github.com/YOUR_USERNAME/spectra-ai.git](https://github.com/YOUR_USERNAME/spectra-ai.git)
cd spectra-ai

### 2. Backend Setup
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

### 3. Create a .env file in backend
OPENAI_API_KEY=sk-...
E2B_API_KEY=e2b_...
TAVILY_API_KEY=tvly-...

### 4. Run the server
python main.py

### 5. Frontend Setup
cd ../frontend
npm install
npm run dev

### 6. Usage
Open http://localhost:3000.
Drag & Drop a CSV file (e.g., titanic.csv or sales data).
Ask a question: "Analyze the survival rate by class and search the web to explain why 3rd class was lower."
