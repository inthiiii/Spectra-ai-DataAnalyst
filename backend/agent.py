import os
from typing import Annotated, List, TypedDict
from dotenv import load_dotenv

# LangGraph & AI
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, BaseMessage, ToolMessage
from langchain_core.tools import tool

# Tools
from e2b_code_interpreter import Sandbox
from tavily import TavilyClient # <--- NEW IMPORT

load_dotenv()

# --- CONFIG ---
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY") # You will add this to .env
CURRENT_DIR = os.getcwd()
UPLOAD_DIR = os.path.join(CURRENT_DIR, "uploads")
CSV_PATH = os.path.join(UPLOAD_DIR, "dataset.csv")

# 1. Define the State
class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], add_messages]
    csv_file_path: str

# 2. Define Tools

# TOOL 1: Python Code Execution (Existing)
@tool
def execute_python(code: str):
    """Executes Python code. Use this for data analysis, calculations, and plotting."""
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
            if execution.results:
                for res in execution.results:
                    if hasattr(res, 'png') and res.png:
                        results.append(f"![CHART_GENERATED](data:image/png;base64,{res.png})")
                    elif hasattr(res, 'text') and res.text:
                        results.append(f"RESULT: {res.text}")
            
            if execution.logs.stdout: results.append(f"STDOUT: {execution.logs.stdout}")
            
            if not results: return "Code executed successfully."
            return "\n".join(results)

    except Exception as e:
        return f"System Error: {str(e)}"

# TOOL 2: Web Search (NEW)
@tool
def web_search(query: str):
    """Search the web for external information, news, or context to explain data trends."""
    print(f"\n--- 🌎 SEARCHING WEB: {query} ---")
    try:
        tavily = TavilyClient(api_key=TAVILY_API_KEY)
        response = tavily.search(query=query, search_depth="basic", max_results=3)
        
        # Format results for the LLM
        context = []
        for result in response.get('results', []):
            context.append(f"Source: {result['title']}\nContent: {result['content']}\nURL: {result['url']}")
        
        return "\n\n".join(context)
    except Exception as e:
        return f"Search Error: {str(e)}"

# 3. Setup the Brain
llm = ChatOpenAI(model="gpt-4o", temperature=0)
# BIND BOTH TOOLS
llm_with_tools = llm.bind_tools([execute_python, web_search])

# SYSTEM PROMPT (Updated for Hybrid Reasoning)
system_prompt = SystemMessage(content="""
You are Spectra, an elite Data Scientist agent with access to Web Search.

YOUR CAPABILITIES:
1. **Analyze Data**: Write Python code to load 'dataset.csv', calculate stats, and plot graphs.
2. **Contextualize**: If you see interesting trends (spikes, drops) or if the user asks "Why?", use the `web_search` tool to find real-world events (news, policy changes) that explain the data.

RULES:
- ALWAYS load csv with `pd.read_csv('dataset.csv')`.
- ALWAYS use `plt.show()` for plots.
- If the user asks a question that requires outside knowledge, SEARCH first, then synthesize with the data.
- Be concise and professional.
""")

# 4. Define Nodes
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
            
            # Route to correct tool
            if tool_call["name"] == "execute_python":
                output = execute_python.invoke(tool_call["args"])
                # Truncate logs for terminal cleanliness
                disp = str(output)[:200] + "..." if len(str(output)) > 200 else str(output)
                print(f"🔎 PYTHON OUTPUT: {disp}")
                results.append(ToolMessage(tool_call_id=tool_call["id"], name="execute_python", content=str(output)))
            
            elif tool_call["name"] == "web_search":
                output = web_search.invoke(tool_call["args"])
                print(f"🔎 SEARCH OUTPUT: {str(output)[:200]}...")
                results.append(ToolMessage(tool_call_id=tool_call["id"], name="web_search", content=str(output)))
                
    return {"messages": results}

# 5. Build Graph
def should_continue(state: AgentState):
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        return "executor"
    return END

workflow = StateGraph(AgentState)
workflow.add_node("reasoner", reasoner)
workflow.add_node("executor", executor)
workflow.set_entry_point("reasoner")
workflow.add_conditional_edges("reasoner", should_continue)
workflow.add_edge("executor", "reasoner")

app_graph = workflow.compile()