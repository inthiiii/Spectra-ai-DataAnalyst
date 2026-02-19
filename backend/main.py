import os
import shutil
import re
import json
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from agent import app_graph
from langchain_core.messages import HumanMessage, ToolMessage

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

class QueryRequest(BaseModel):
    query: str

class AnalysisResponse(BaseModel):
    response: str
    chart_data: List[str] # Now a LIST of JSON strings
    chart_type: Optional[str]

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        file_path = os.path.join(UPLOAD_DIR, "dataset.csv")
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"message": "File uploaded successfully", "path": file_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_data(request: QueryRequest):
    inputs = {
        "messages": [HumanMessage(content=request.query)],
        "csv_file_path": os.path.join(UPLOAD_DIR, "dataset.csv") 
    }
    
    final_state = app_graph.invoke(inputs)
    last_message = final_state["messages"][-1]
    final_text = last_message.content
    
    # --- MULTI-CHART EXTRACTION LOGIC ---
    charts = []
    chart_type = None # 'plotly' or 'png'

    # Helper to find ALL charts in text
    def extract_charts(text):
        found_charts = []
        c_type = None
        
        # 1. Find ALL Plotly JSONs
        plotly_matches = re.findall(r'PLOTLY_JSON_START(.*?)PLOTLY_JSON_END', text, re.DOTALL)
        if plotly_matches:
            found_charts.extend(plotly_matches)
            c_type = 'plotly'
        
        # 2. Find ALL PNGs (Fallback)
        # Note: Usually we stick to one type, but let's grab PNGs if no plotly found
        if not found_charts:
            png_matches = re.findall(r'!\[CHART_GENERATED\]\((data:image/.*?;base64,.*?)\)', text, re.DOTALL)
            if png_matches:
                found_charts.extend(png_matches)
                c_type = 'png'
                
        return found_charts, c_type

    # 1. Check final response
    charts, chart_type = extract_charts(final_text)
    
    # 2. If missing, check Tool History (The Resurrection Logic)
    if not charts:
        for msg in reversed(final_state["messages"]):
            if isinstance(msg, ToolMessage):
                found, c_type = extract_charts(msg.content)
                if found:
                    charts.extend(found)
                    chart_type = c_type
                    # If we found charts in one message, we can stop, or keep looking for more.
                    # Let's stop to avoid duplicates if the LLM repeats itself.
                    break
    
    # Clean up the text response
    final_text = re.sub(r'PLOTLY_JSON_START.*?PLOTLY_JSON_END', '', final_text, flags=re.DOTALL)
    final_text = re.sub(r'!\[CHART_GENERATED\]\(.*?\)', '', final_text, flags=re.DOTALL)

    return {
        "response": final_text,
        "chart_data": charts, # List of strings
        "chart_type": chart_type
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)