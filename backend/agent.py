import os
import re
import json
from typing import Annotated, List, TypedDict
from dotenv import load_dotenv

from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver 
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

@tool
def execute_python(code: str):
    """Executes Python code. Supports Plotly and Data Export."""
    print(f"\n--- ⚡️ EXECUTING CODE ---")
    print(code)
    
    try:
        with Sandbox.create() as sandbox:
            if os.path.exists(CSV_PATH):
                with open(CSV_PATH, "rb") as f:
                    sandbox.files.write("dataset.csv", f)
            
            execution = sandbox.run_code(code)
            
            if execution.error:
                return f"Runtime Error: {execution.error.name}: {execution.error.value}"
            
            results = []
            
            # Gather all output sources
            stdout_str = ""
            if execution.logs.stdout:
                stdout_str += "\n".join(execution.logs.stdout)
            if execution.results:
                for res in execution.results:
                    if hasattr(res, 'text'):
                        stdout_str += "\n" + str(res.text)

            # --- STRATEGY 1: EXPLICIT TAGS ---
            chart_matches = re.findall(r'__CHART_START__(.*?)__CHART_END__', stdout_str, re.DOTALL)
            
            # --- STRATEGY 2: RAW JSON FALLBACK ---
            if not chart_matches:
                lines = stdout_str.split('\n')
                for line in lines:
                    clean = line.strip()
                    if clean.startswith('{') and '"data":' in clean and '"layout":' in clean:
                        chart_matches.append(clean)

            # Process found charts
            for chart_json in chart_matches:
                results.append(f"PLOTLY_JSON_START{chart_json.strip()}PLOTLY_JSON_END")
            
            # Handle File Download
            if "[DOWNLOAD_READY]" in stdout_str:
                 try:
                     file_bytes = sandbox.files.read_bytes("cleaned_dataset.csv")
                     with open(os.path.join(UPLOAD_DIR, "cleaned_dataset.csv"), "wb") as fb:
                         fb.write(file_bytes)
                     results.append("STDOUT: File synced to server successfully.")
                 except Exception as e:
                     results.append(f"STDOUT: Failed to sync file. Error: {e}")

            # Stop the loop if charts found
            if chart_matches:
                results.append("\n[SYSTEM]: Charts successfully generated. STOP coding. Summarize.")
            elif not results:
                results.append(f"STDOUT: {stdout_str[:1000]}...") # Truncate to save tokens

            return "\n".join(results)

    except Exception as e:
        return f"System Error: {str(e)}"

@tool
def web_search(query: str):
    """Search the web for context."""
    try:
        tavily = TavilyClient(api_key=TAVILY_API_KEY)
        response = tavily.search(query=query, search_depth="basic", max_results=3)
        context = [f"Source: {r['title']}\nContent: {r['content']}" for r in response.get('results', [])]
        return "\n\n".join(context)
    except Exception as e:
        return f"Search Error: {str(e)}"

system_prompt = SystemMessage(content="""
You are Spectra, an autonomous Data Scientist.

DIRECTIVES:
1. DATASET: 'dataset.csv' is loaded.
2. VISUALIZATION: 
   - Use `plotly.express` (`px`).
   - Print JSON: `print(fig.to_json())`.
   - OPTIONAL: You may wrap output in `print("__CHART_START__")` ... `print("__CHART_END__")` for better parsing, but raw print is acceptable.
3. DASHBOARD: Print multiple JSONs for multiple charts.
4. STOPPING RULE: If tool output says "Charts successfully generated", STOP coding.

DATA CLEANING:
- Modify df -> `df.to_csv('cleaned_dataset.csv', index=False)` -> `print("[DOWNLOAD_READY]")`
""")

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
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
                results.append(ToolMessage(tool_call_id=tool_call["id"], name="execute_python", content=str(output)))
            elif tool_call["name"] == "web_search":
                output = web_search.invoke(tool_call["args"])
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

memory = MemorySaver()
app_graph = workflow.compile(checkpointer=memory)