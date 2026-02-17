import os
import shutil
import re
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from agent import app_graph
from langchain_core.messages import HumanMessage, ToolMessage

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# PATH CONFIG
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

class QueryRequest(BaseModel):
    query: str

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        file_path = os.path.join(UPLOAD_DIR, "dataset.csv")
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        print(f"✅ File saved at: {file_path}")
        return {"message": "File uploaded successfully", "path": file_path}
    except Exception as e:
        print(f"❌ Upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze")
async def analyze_data(request: QueryRequest):
    # 1. Run the Agent
    inputs = {
        "messages": [HumanMessage(content=request.query)],
        "csv_file_path": os.path.join(UPLOAD_DIR, "dataset.csv") 
    }
    
    final_state = app_graph.invoke(inputs)
    
    # 2. Extract Response Text
    last_message = final_state["messages"][-1]
    final_text = last_message.content
    
    # 3. ROBUST CHART EXTRACTION
    # We look for the chart in the TOOL history, not just the final text.
    chart_data = None
    
    # First, check if the LLM put it in the final text
    match = re.search(r'!\[CHART_GENERATED\]\((data:image/.*?;base64,.*?)\)', final_text, re.DOTALL)
    if match:
        chart_data = match.group(1)
        # Remove the massive string from the text to keep it clean
        final_text = final_text.replace(match.group(0), "")
    
    # If not in final text, check the Tool history (The "Resurrection" Logic)
    if not chart_data:
        for msg in reversed(final_state["messages"]):
            if isinstance(msg, ToolMessage):
                match = re.search(r'!\[CHART_GENERATED\]\((data:image/.*?;base64,.*?)\)', msg.content, re.DOTALL)
                if match:
                    chart_data = match.group(1)
                    break

    # 4. Return Structured Data
    return {
        "response": final_text,
        "chart_data": chart_data  # Send separately!
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)