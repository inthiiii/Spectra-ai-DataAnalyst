import os
import json
from typing import Annotated, List, TypedDict
from dotenv import load_dotenv

from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, BaseMessage, ToolMessage
from langchain_core.tools import tool

from e2b_code_interpreter import Sandbox
from tavily import TavilyClient

load_dotenv()

# CONFIG
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
CURRENT_DIR = os.getcwd()
UPLOAD_DIR = os.path.join(CURRENT_DIR, "uploads")
CSV_PATH = os.path.join(UPLOAD_DIR, "dataset.csv")

class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], add_messages]
    csv_file_path: str

# --- UPDATED TOOL: PYTHON WITH PLOTLY ---
@tool
def execute_python(code: str):
    """Executes Python code. Supports Plotly for interactive charts."""
    print(f"\n--- ⚡️ EXECUTING CODE ---")
    print(code)
    
    try:
        with Sandbox.create() as sandbox:
            # 1. Upload Dataset
            if os.path.exists(CSV_PATH):
                with open(CSV_PATH, "rb") as f:
                    sandbox.files.write("dataset.csv", f)
            
            # 2. Run Code
            execution = sandbox.run_code(code)
            
            if execution.error:
                return f"Runtime Error: {execution.error.name}: {execution.error.value}"
            
            results = []
            
            # 3. Handle Plotly JSON Output (The Unicorn Feature)
            # We check for a special print statement or a result object that looks like JSON
            if execution.results:
                for res in execution.results:
                    # If it's a Plotly JSON string (we'll guide the LLM to output this)
                    if hasattr(res, 'text') and res.text and res.text.startswith('{') and '"data":' in res.text:
                        results.append(f"PLOTLY_JSON_START{res.text}PLOTLY_JSON_END")
                    elif hasattr(res, 'text'):
                        results.append(f"RESULT: {res.text}")
                    # Keep PNG support just in case
                    elif hasattr(res, 'png') and res.png:
                        results.append(f"![CHART_GENERATED](data:image/png;base64,{res.png})")

            if execution.logs.stdout:
                # Also check stdout for JSON
                for line in execution.logs.stdout:
                    if line.startswith('{') and '"data":' in line:
                         results.append(f"PLOTLY_JSON_START{line}PLOTLY_JSON_END")
                    else:
                        results.append(f"STDOUT: {line}")
            
            if not results: return "Code executed successfully."
            return "\n".join(results)

    except Exception as e:
        return f"System Error: {str(e)}"

@tool
def web_search(query: str):
    """Search the web for context."""
    print(f"\n--- 🌎 SEARCHING WEB: {query} ---")
    try:
        tavily = TavilyClient(api_key=TAVILY_API_KEY)
        response = tavily.search(query=query, search_depth="basic", max_results=3)
        context = [f"Source: {r['title']}\nURL: {r['url']}\nContent: {r['content']}" for r in response.get('results', [])]
        return "\n\n".join(context)
    except Exception as e:
        return f"Search Error: {str(e)}"

# --- UPDATED PROMPT FOR MULTI-CHART DASHBOARDS ---
system_prompt = SystemMessage(content="""
You are Spectra, an elite Data Scientist agent.

VISUALIZATION RULES (CRITICAL):
1. **Prioritize Plotly Express** (`px`) for charts. 
2. **Dashboard Mode**: If the user asks for a "dashboard", "overview", or multiple insights, GENERATE MULTIPLE CHARTS.
3. **Output Format**: For EACH chart you create, you must print its JSON individually.
   - Code pattern:
     ```python
     import plotly.express as px
     # Chart 1
     fig1 = px.line(...)
     print(fig1.to_json()) 
     
     # Chart 2
     fig2 = px.bar(...)
     print(fig2.to_json())
     ```
4. Do NOT use `fig.show()`. Use `print(fig.to_json())`.

DATA RULES:
- Load data: `pd.read_csv('dataset.csv')`.
- If the user asks for "Trends", use Plotly Line charts.
- If the user asks for "Comparison", use Plotly Bar charts.
- If the user asks for "Distribution", use Plotly Histograms or Pie charts.

GENERAL:
- If context is missing, use `web_search`.
- Be concise.
""")

llm = ChatOpenAI(model="gpt-4o", temperature=0)
llm_with_tools = llm.bind_tools([execute_python, web_search])

def reasoner(state: AgentState):
    messages = state["messages"]
    if not isinstance(messages[0], SystemMessage):
        messages = [system_prompt] + messages
    return {"messages": [llm_with_tools.invoke(messages)]}

def executor(state: AgentState):
    last_message = state["messages"][-1]
    results = []
    if hasattr(last_message, "tool_calls"):
        for tool_call in last_message.tool_calls:
            if tool_call["name"] == "execute_python":
                output = execute_python.invoke(tool_call["args"])
                print(f"🔎 PYTHON OUTPUT (Truncated): {str(output)[:200]}...")
                results.append(ToolMessage(tool_call_id=tool_call["id"], name="execute_python", content=str(output)))
            elif tool_call["name"] == "web_search":
                output = web_search.invoke(tool_call["args"])
                print(f"🔎 SEARCH OUTPUT: {str(output)[:200]}...")
                results.append(ToolMessage(tool_call_id=tool_call["id"], name="web_search", content=str(output)))
    return {"messages": results}

def should_continue(state: AgentState):
    return "executor" if state["messages"][-1].tool_calls else END

workflow = StateGraph(AgentState)
workflow.add_node("reasoner", reasoner)
workflow.add_node("executor", executor)
workflow.set_entry_point("reasoner")
workflow.add_conditional_edges("reasoner", should_continue)
workflow.add_edge("executor", "reasoner")
app_graph = workflow.compile()