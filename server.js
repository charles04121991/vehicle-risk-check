const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

/*
==================================================
Vehicle Risk Check API
==================================================

功能：
1. 警政署公開資料：車輛／號牌失竊查詢
2. 號牌輸入格式分析
3. 牌照種類 × 使用者觀察車種的一致性提示

重要：
- 本系統不會僅憑車牌號碼宣稱某車為「假牌」或「套牌」。
- 未取得可公開驗證的完整車籍資料時，不推測車主、廠牌、車型、顏色或所有權。
- 「查無資料」只代表官方公開資料服務在該次查詢回傳查無資料。
*/


/*
==================================================
CORS
==================================================
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
==================================================
牌照種類
==================================================
*/

const VEHICLE_TYPES = {

  A: {
    name: "汽車",
    group: "car"
  },

  B: {
    name: "重機車",
    group: "motorcycle"
  },

  C: {
    name: "輕機車",
    group: "motorcycle"
  },

  S: {
    name: "微電車",
    group: "micro_ev"
  },

  T: {
    name: "拖車",
    group: "trailer"
  },

  G: {
    name: "動力機械車",
    group: "machinery"
  },

  TEMP: {
    name: "臨時牌",
    group: "temporary"
  },

  R: {
    name: "試車牌",
    group: "test_plate"
  }

};


/*
==================================================
首頁 API 狀態
==================================================
*/

app.get("/", (req, res) => {

  res.json({

    success: true,

    service:
      "Vehicle Risk Check API",

    message:
      "車輛風險查詢 API 正常運作",

    version:
      "2.0.0",

    modules: [
      "官方車輛／號牌失竊查詢",
      "號牌基本格式分析",
      "車種一致性線索分析"
    ]

  });

});


/*
==================================================
CSV 單行解析器
==================================================
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
==================================================
解析警政署 CSV
==================================================
*/

function parseOfficialCsv(csvText) {

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


  const lines =

    cleaned

      .split("\n")

      .map(
        line => line.trim()
      )

      .filter(Boolean);


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
==================================================
車牌基本格式分析
==================================================

這裡只做「輸入結構」檢查。

不把簡化 Regex 當成完整台灣號牌真偽判定規則，
避免舊式號牌、特殊號牌、不同年代編碼被誤判。

==================================================
*/

function analyzePlateFormat(plate) {

  const normalized =
    String(plate || "")
      .trim()
      .toUpperCase();


  const issues = [];

  const allowedCharacters =
    /^[A-Z0-9-]+$/;


  if (!normalized) {

    issues.push(
      "未提供車牌號碼"
    );

  }


  if (
    normalized &&
    !allowedCharacters.test(
      normalized
    )
  ) {

    issues.push(
      "包含英文字母、數字及連字號以外的字元"
    );

  }


  if (
    normalized.startsWith("-") ||
    normalized.endsWith("-")
  ) {

    issues.push(
      "連字號位於車牌號碼開頭或結尾"
    );

  }


  if (
    normalized.includes("--")
  ) {

    issues.push(
      "出現連續連字號"
    );

  }


  const hyphenCount =

    (
      normalized.match(/-/g) ||
      []
    ).length;


  if (hyphenCount > 1) {

    issues.push(
      "出現多個連字號，請確認輸入是否正確"
    );

  }


  const compact =

    normalized.replace(
      /-/g,
      ""
    );


  if (
    compact.length < 2 ||
    compact.length > 10
  ) {

    issues.push(
      "車牌字元長度較不尋常，請再次確認"
    );

  }


  if (
    compact &&
    !/[A-Z0-9]/.test(
      compact
    )
  ) {

    issues.push(
      "未找到有效的英文字母或數字"
    );

  }


  return {

    status:
      issues.length === 0
        ? "NO_BASIC_FORMAT_ISSUE"
        : "CHECK_INPUT",

    normalizedPlate:
      normalized,

    basicFormatValid:
      issues.length === 0,

    issues,

    message:
      issues.length === 0

        ? "未發現基本輸入格式異常。此結果僅代表字元與基本結構可被系統正常辨識，不代表號牌真偽或車籍狀態已獲官方驗證。"

        : "輸入格式有需要再次確認的地方。這不代表該號牌為偽造或套牌。"

  };

}


/*
==================================================
車種一致性線索分析
==================================================

使用者可選填 observedVehicle：
passenger
suv
van
truck
motorcycle
other

本模組只檢查「明顯類別矛盾」。

例如：
使用者選擇牌照種類 = 重機車
但實際看到的車 = 小客車

這是輸入／觀察資訊矛盾，
不是「套牌判定」。

==================================================
*/

function analyzeObservedConsistency(
  vehicleTypeCode,
  observedVehicle
) {

  const typeInfo =
    VEHICLE_TYPES[
      vehicleTypeCode
    ];


  if (!observedVehicle) {

    return {

      status:
        "NOT_CHECKED",

      hasConflict:
        false,

      message:
        "未提供實際觀察車種，因此未進行車種一致性線索分析。"

    };

  }


  const observedCarGroups = [
    "passenger",
    "suv",
    "van",
    "truck"
  ];


  const observedIsCar =

    observedCarGroups.includes(
      observedVehicle
    );


  const observedIsMotorcycle =

    observedVehicle ===
    "motorcycle";


  let hasConflict =
    false;


  let reason =
    "";


  if (
    typeInfo.group === "car" &&
    observedIsMotorcycle
  ) {

    hasConflict =
      true;

    reason =
      "查詢時選擇的牌照種類為汽車，但實際觀察車種填寫為機車。";

  }


  else if (
    (
      typeInfo.group === "motorcycle" ||
      typeInfo.group === "micro_ev"
    ) &&
    observedIsCar
  ) {

    hasConflict =
      true;

    reason =
      "查詢時選擇的牌照種類屬機車／微型電動二輪車，但實際觀察車種填寫為汽車類。";

  }


  if (hasConflict) {

    return {

      status:
        "OBSERVATION_CONFLICT",

      hasConflict:
        true,

      reason,

      message:
        "牌照種類與使用者填寫的實際觀察車種存在明顯類別矛盾。請先確認輸入是否正確；此結果不能單獨用來判定套牌、假牌或犯罪事實。"

    };

  }


  return {

    status:
      "NO_OBVIOUS_CONFLICT",

    hasConflict:
      false,

    message:
      "依目前提供的牌照種類與實際觀察車種，未發現明顯的基本類別矛盾。此結果不等同官方車籍比對。"

  };

}


/*
==================================================
車輛失竊／號牌失竊查詢 API

範例：

/api/vehicle?type=A&plate=AXW-3000

可選填：
&observedVehicle=passenger

==================================================
*/

app.get(
  "/api/vehicle",

  async (req, res) => {

    try {

      /*
      ==============================================
      取得參數
      ==============================================
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


      const observedVehicle =

        String(
          req.query.observedVehicle ||
          ""
        )

          .trim()

          .toLowerCase();


      /*
      ==============================================
      基本驗證
      ==============================================
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


      if (
        !/^[A-Z0-9-]+$/.test(
          plate
        )
      ) {

        return res
          .status(400)
          .json({

            success: false,

            code:
              "INVALID_PLATE_CHARACTERS",

            message:
              "車牌號碼包含不支援的字元"

          });

      }


      /*
      ==============================================
      本地分析
      ==============================================
      */

      const plateAnalysis =

        analyzePlateFormat(
          plate
        );


      const consistencyAnalysis =

        analyzeObservedConsistency(
          type,
          observedVehicle
        );


      /*
      ==============================================
      建立警政署官方查詢
      ==============================================
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
      ==============================================
      呼叫官方公開資料服務
      ==============================================
      */

      const response =

        await fetch(

          officialUrl,

          {

            method:
              "GET",

            headers: {

              "User-Agent":
                "Vehicle-Risk-Check/2.0",

              "Accept":
                "text/csv,text/plain,*/*"

            },

            signal:
              AbortSignal.timeout(
                15000
              )

          }

        );


      if (!response.ok) {

        throw new Error(

          "官方資料服務 HTTP " +

          response.status

        );

      }


      const csvText =

        await response.text();


      const officialResult =

        parseOfficialCsv(
          csvText
        );


      /*
      ==============================================
      綜合狀態

      注意：
      這不是「犯罪風險分數」。

      HIGH_ATTENTION：
      官方失車資料有紀錄

      REVIEW_INPUT：
      官方查無失車資料，
      但輸入格式或觀察資訊有矛盾

      NO_FLAG_FOUND：
      官方查無失車資料，
      且本地基本檢查未發現明顯矛盾
      ==============================================
      */

      let overallStatus;


      if (
        officialResult.status ===
        "RECORD_FOUND"
      ) {

        overallStatus =
          "HIGH_ATTENTION";

      }

      else if (
        !plateAnalysis.basicFormatValid ||
        consistencyAnalysis.hasConflict
      ) {

        overallStatus =
          "REVIEW_INPUT";

      }

      else {

        overallStatus =
          "NO_FLAG_FOUND";

      }


      /*
      ==============================================
      回傳
      ==============================================
      */

      return res.json({

        success: true,

        query: {

          vehicleTypeCode:
            type,

          vehicleTypeName:
            VEHICLE_TYPES[type].name,

          plateNumber:
            plate,

          observedVehicle:
            observedVehicle ||
            null

        },

        officialStolenVehicleCheck: {

          ...officialResult,

          source: {

            name:
              "內政部警政署公開資料服務",

            description:
              "車輛竊盜、車牌失竊查詢資料"

          }

        },

        plateAnalysis,

        consistencyAnalysis,

        overall: {

          status:
            overallStatus,

          disclaimer:
            "本結果整合官方失車公開資料與基本輸入／觀察一致性檢查。除官方失車查詢結果外，其餘分析不等同官方車籍驗證，也不能單獨用來判定假牌、套牌、所有權或犯罪事實。"

        },

        /*
        保留舊版欄位，
        避免目前 index.html 立即壞掉。
        */

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
      查詢失敗絕不能當成查無資料
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
==================================================
404
==================================================
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
==================================================
啟動 Server
==================================================
*/

app.listen(

  PORT,

  () => {

    console.log(

      `Vehicle Risk API v2.0 running on port ${PORT}`

    );

  }

);
