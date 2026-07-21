const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;


/*
========================================
CORS
允許 GitHub Pages 前端呼叫
========================================
*/

app.use((req, res, next) => {

  res.header(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  res.header(
    "Access-Control-Allow-Methods",
    "GET, OPTIONS"
  );

  next();

});


/*
========================================
首頁 API 狀態
========================================
*/

app.get("/", (req, res) => {

  res.json({

    success: true,

    service:
      "Vehicle Risk Check API",

    message:
      "車輛風險查詢 API 正常運作",

    version:
      "1.1.0"

  });

});


/*
========================================
牌照種類
========================================
*/

const VEHICLE_TYPES = {

  A: "汽車",

  B: "重機車",

  C: "輕機車",

  S: "微電車",

  T: "拖車",

  G: "動力機械車",

  TEMP: "臨時牌",

  R: "試車牌"

};


/*
========================================
簡易 CSV 單行解析器

支援：
一般欄位
"含逗號的欄位"
"" 雙引號跳脫
========================================
*/

function parseCsvLine(line) {

  const values = [];

  let current = "";

  let insideQuotes = false;


  for (
    let i = 0;
    i < line.length;
    i++
  ) {

    const char = line[i];


    if (char === '"') {

      /*
      CSV 裡的 ""
      代表一個雙引號
      */

      if (
        insideQuotes &&
        line[i + 1] === '"'
      ) {

        current += '"';

        i++;

      }

      else {

        insideQuotes =
          !insideQuotes;

      }

    }

    else if (
      char === "," &&
      !insideQuotes
    ) {

      values.push(
        current.trim()
      );

      current = "";

    }

    else {

      current += char;

    }

  }


  values.push(
    current.trim()
  );


  return values;

}


/*
========================================
解析警政署 CSV
========================================
*/

function parseOfficialCsv(csvText) {

  /*
  去除 BOM
  統一換行
  */

  const cleaned =

    String(csvText || "")

      .replace(/^\uFEFF/, "")

      .replace(/\r\n/g, "\n")

      .replace(/\r/g, "\n")

      .trim();


  if (!cleaned) {

    throw new Error(
      "官方服務回傳空白內容"
    );

  }


  /*
  移除空白行
  */

  const lines =

    cleaned

      .split("\n")

      .map(
        line => line.trim()
      )

      .filter(Boolean);


  /*
  找 CSV 標題列

  預期：
  車型,車牌,失車查詢結果,查詢時間
  */

  const headerIndex =

    lines.findIndex(

      line =>

        line.includes("車型") &&

        line.includes("車牌") &&

        line.includes("失車查詢結果")

    );


  if (headerIndex === -1) {

    throw new Error(
      "無法辨識官方資料格式"
    );

  }


  /*
  標題下一行才是查詢資料
  */

  const dataLine =
    lines[headerIndex + 1];


  if (!dataLine) {

    throw new Error(
      "官方資料沒有查詢結果列"
    );

  }


  const values =
    parseCsvLine(dataLine);


  if (values.length < 4) {

    throw new Error(
      "官方查詢結果欄位不完整"
    );

  }


  const vehicleType =
    values[0];

  const plateNumber =
    values[1];

  const resultText =
    values[2];

  const queryTime =
    values[3];


  /*
  ========================================
  判定官方結果狀態

  NOT_FOUND：
  官方本次回傳「查無資料」

  RECORD_FOUND：
  官方回傳非「查無資料」的失車結果

  注意：
  RECORD_FOUND 不自行延伸解讀犯罪事實
  ========================================
  */

  let status;


  if (
    resultText.includes(
      "查無資料"
    )
  ) {

    status =
      "NOT_FOUND";

  }

  else {

    status =
      "RECORD_FOUND";

  }


  return {

    vehicleType,

    plateNumber,

    status,

    resultText,

    queryTime

  };

}


/*
========================================
車輛失竊／車牌失竊查詢 API

範例：

/api/vehicle?type=A&plate=AXW-3000
========================================
*/

app.get(
  "/api/vehicle",

  async (req, res) => {

    try {

      /*
      ========================================
      取得查詢參數
      ========================================
      */

      const type =

        String(
          req.query.type || ""
        )

          .trim()

          .toUpperCase();


      const plate =

        String(
          req.query.plate || ""
        )

          .trim()

          .toUpperCase()

          .replace(/\s+/g, "");


      /*
      ========================================
      基本驗證
      ========================================
      */

      if (!type || !plate) {

        return res
          .status(400)
          .json({

            success: false,

            code:
              "MISSING_PARAMETERS",

            message:
              "請提供牌照種類與車牌號碼"

          });

      }


      if (
        !Object.prototype
          .hasOwnProperty
          .call(
            VEHICLE_TYPES,
            type
          )
      ) {

        return res
          .status(400)
          .json({

            success: false,

            code:
              "INVALID_VEHICLE_TYPE",

            message:
              "不支援的牌照種類"

          });

      }


      /*
      車牌只允許基本合理字元

      不在這裡過度限制格式，
      因為不同牌照種類格式不同。
      */

      if (
        !/^[A-Z0-9\-]+$/.test(
          plate
        )
      ) {

        return res
          .status(400)
          .json({

            success: false,

            code:
              "INVALID_PLATE_FORMAT",

            message:
              "車牌號碼格式不正確"

          });

      }


      /*
      ========================================
      建立官方查詢參數
      ========================================
      */

      const params =

        new URLSearchParams({

          vehType:
            type,

          vehNumber:
            plate

        });


      const officialUrl =

        "https://eze8.npa.gov.tw" +

        "/E82OpendataWebE/veh/query_veh?" +

        params.toString();


      /*
      ========================================
      呼叫警政署公開資料服務
      ========================================
      */

      const response =

        await fetch(

          officialUrl,

          {

            method:
              "GET",

            headers: {

              "User-Agent":
                "Vehicle-Risk-Check/1.1",

              "Accept":
                "text/csv,text/plain,*/*"

            },

            signal:
              AbortSignal.timeout(
                15000
              )

          }

        );


      /*
      ========================================
      HTTP 錯誤
      ========================================
      */

      if (!response.ok) {

        throw new Error(

          "官方資料服務 HTTP " +

          response.status

        );

      }


      /*
      ========================================
      取得官方 CSV
      ========================================
      */

      const csvText =

        await response.text();


      /*
      ========================================
      解析官方結果
      ========================================
      */

      const officialResult =

        parseOfficialCsv(
          csvText
        );


      /*
      ========================================
      成功回傳
      ========================================
      */

      return res.json({

        success: true,

        query: {

          vehicleTypeCode:
            type,

          vehicleTypeName:
            VEHICLE_TYPES[type],

          plateNumber:
            plate

        },

        officialResult,

        source: {

          name:
            "內政部警政署公開資料服務",

          description:
            "車輛竊盜、車牌失竊查詢資料"

        },

        queriedAt:

          new Date()
            .toISOString()

      });

    }


    catch (error) {

      console.error(

        "Vehicle query error:",

        error

      );


      /*
      ========================================
      重要：

      查詢失敗不能回傳
      「查無失竊資料」

      必須明確告訴前端
      官方資料目前無法確認
      ========================================
      */

      return res
        .status(502)
        .json({

          success: false,

          code:
            "OFFICIAL_QUERY_FAILED",

          message:
            "目前無法完成官方失車資料查詢，請稍後再試",

          detail:
            error.message

        });

    }

  }

);


/*
========================================
404
========================================
*/

app.use((req, res) => {

  res
    .status(404)
    .json({

      success: false,

      code:
        "NOT_FOUND",

      message:
        "找不到此 API 路徑"

    });

});


/*
========================================
啟動 Server
========================================
*/

app.listen(

  PORT,

  () => {

    console.log(

      `Vehicle Risk API running on port ${PORT}`

    );

  }

);
