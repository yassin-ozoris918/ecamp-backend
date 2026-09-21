const { ValidationPipe } = require('@nestjs/common');
const { plainToInstance } = require('class-transformer');
const { ReorderItemsPayloadDto } = require('./dist/lectures/dto/reorder-items.dto');

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

async function run() {
  try {
    const obj = plainToInstance(ReorderItemsPayloadDto, {
      items: [
        { id: "123", type: "SESSION", orderIndex: 1, extra: "dropme" }
      ]
    });
    const result = await pipe.transform(obj, { type: 'body', metatype: ReorderItemsPayloadDto });
    console.log("Validated:", JSON.stringify(result));
  } catch (e) {
    console.error("Error:", e.response);
  }
}
run();
