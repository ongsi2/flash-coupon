import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

export function IsDateRangeValid(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isDateRangeValid',
            target: object.constructor,
            propertyName,
            options: validationOptions,
            validator: {
                validate(value: any, args: ValidationArguments) {
                    const obj = args.object as any;
                    const startAt = new Date(obj.startAt);
                    const endAt = new Date(obj.endAt);
                    return startAt < endAt;
                },
                defaultMessage() {
                    return '시작일이 종료일보다 앞서야 합니다.';
                },
            },
        });
    };
}
