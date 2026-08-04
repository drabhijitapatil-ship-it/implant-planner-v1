"""Seed a procedure for iter-403 Add-Implant IOPA picker test."""
import os, sys, asyncio
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')

REG_NO = 'IOPA-FIX-1'

async def run(cmd):
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]
    if cmd == 'seed':
        await db.procedures.delete_many({'registration_number': REG_NO})
        _id = ObjectId()
        doc = {
            '_id': _id,
            'registration_number': REG_NO,
            'status': 'phase2_approved',
            'implant_procedure_type': 'Multiple Conventional Implants',
            'implants': [{'tooth_number': '16', 'system': 'Nobel — Active', 'brand': 'Nobel',
                          'diameter': 4.3, 'length': 10}],
            'implant_plans': [{'position': '16', 'brand': 'Nobel', 'system': 'Active',
                               'diameter': '4.3', 'length': '10'}],
            'missing_teeth': ['16'],
            'supervisor_id': '69b79407a17f36c024eb2d60',
            'implant_incharge_id': '69b79407a17f36c024eb2d5e',
            'created_by_id': '69b79407a17f36c024eb2d5e',
            'created_by_role': 'implant_incharge',
            'patient_name': 'IOPA Fix Test',
            'patient_age': 55,
            'patient_sex': 'M',
            'implant_addition_requests': [],
        }
        await db.procedures.insert_one(doc)
        print('SEEDED', str(_id))
    elif cmd == 'find':
        d = await db.procedures.find_one({'registration_number': REG_NO})
        if d:
            print('ID', str(d['_id']))
            print('implants_count', len(d.get('implants', [])))
            print('requests', len(d.get('implant_addition_requests', [])))
            for i, im in enumerate(d.get('implants', [])):
                print(f"  imp{i}: tooth={im.get('tooth_number')} system={im.get('system')} iopa={im.get('iopa_url')}")
    elif cmd == 'cleanup':
        r = await db.procedures.delete_many({'registration_number': REG_NO})
        print('DELETED', r.deleted_count)
    client.close()

if __name__ == '__main__':
    asyncio.run(run(sys.argv[1] if len(sys.argv) > 1 else 'seed'))
